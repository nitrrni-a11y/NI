import os
import re
import uuid
import json
import string
from typing import List, Tuple, Optional
from pydantic import BaseModel, Field
from sklearn.metrics.pairwise import cosine_similarity
from dotenv import load_dotenv

from app.pipeline.schemas import ExistingTopic, EntityContext
from app.pipeline.claim_enrichment import get_model
from app.pipeline.groq_utils import get_groq_client, groq_chat_completion_with_retry

load_dotenv(override=True)

class TopicResult(BaseModel):
    topic_name: str = Field(description="The canonical name of the topic. Must be a generic, reusable subject category without entity or domain names.")
    is_new_topic: bool = Field(description="True if you created a completely new topic, False if you reused an existing one.")

# Backwards compatibility alias
GemmaTopicResult = TopicResult

# Canonical mappings for standard subject categories across entities
CANONICAL_TOPIC_REMAP = {
    "facilities": "Infrastructure & Facilities",
    "infrastructure": "Infrastructure & Facilities",
    "campus infrastructure": "Infrastructure & Facilities",
    "placement": "Placements & Careers",
    "placements": "Placements & Careers",
    "careers": "Placements & Careers",
    "career opportunities": "Placements & Careers",
    "exams": "Examinations",
    "exam": "Examinations",
    "examination": "Examinations",
    "accommodation": "Hostel & Accommodation",
    "hostel": "Hostel & Accommodation",
    "hostels": "Hostel & Accommodation",
    "events": "Campus Events",
    "campus event": "Campus Events",
    "partnerships": "Institutional Partnerships",
    "partnership": "Institutional Partnerships",
    "collaborations": "Institutional Partnerships",
    "student feedback": "Student Experience",
    "feedback": "Student Experience",
    "student life": "Student Experience",
    "student satisfaction": "Student Experience",
    "academics": "Academics & Curriculum",
    "curriculum": "Academics & Curriculum",
    "coursework": "Academics & Curriculum",
    "faculty": "Faculty & Teaching",
    "teaching": "Faculty & Teaching",
    "admissions": "Admissions & Enrollment",
    "admission": "Admissions & Enrollment",
    "governance": "Administration & Governance",
    "administration": "Administration & Governance"
}

def sanitize_topic_name(proposed_name: str, entity_name: str = "", domain: str = "") -> str:
    """
    Cleans topic names to ensure they represent pure, reusable subject categories.
    Removes entity names, domain names, IDs, and punctuation prefixes/suffixes.
    """
    if not proposed_name or not isinstance(proposed_name, str):
        return "Unknown"

    text = proposed_name.strip()

    # 1. Strip any parenthetical notes (e.g. '(NIT Raipur)', '(ID: ...)', '(Education)')
    text = re.sub(r'\(.*?\)', '', text).strip()
    text = re.sub(r'\[.*?\]', '', text).strip()

    # 2. Strip entity name if present at start, end, or inside with separators
    if entity_name and entity_name.strip() and entity_name.lower() != "unknown":
        ent = entity_name.strip()
        # Escape for regex
        esc_ent = re.escape(ent)
        # Strip from beginning: 'NIT Raipur - Placements' -> 'Placements'
        text = re.sub(rf'^{esc_ent}\s*[-–—:|/]\s*', '', text, flags=re.IGNORECASE).strip()
        # Strip from beginning without punctuation: 'NIT Raipur Placements' -> 'Placements'
        text = re.sub(rf'^{esc_ent}\s+', '', text, flags=re.IGNORECASE).strip()
        # Strip from end: 'Placements - NIT Raipur' -> 'Placements'
        text = re.sub(rf'\s*[-–—:|/]\s*{esc_ent}$', '', text, flags=re.IGNORECASE).strip()
        text = re.sub(rf'\s+{esc_ent}$', '', text, flags=re.IGNORECASE).strip()

        # Also strip single individual words of entity if it's an acronym or common identifier
        ent_parts = [p for p in ent.split() if len(p) >= 3 and p.lower() not in ("the", "and", "for", "of")]
        for p in ent_parts:
            esc_p = re.escape(p)
            text = re.sub(rf'^{esc_p}\s*[-–—:|/]\s*', '', text, flags=re.IGNORECASE).strip()
            text = re.sub(rf'^{esc_p}\s+', '', text, flags=re.IGNORECASE).strip()
            text = re.sub(rf'\s*[-–—:|/]\s*{esc_p}$', '', text, flags=re.IGNORECASE).strip()

    # 3. Strip domain name if present as prefix/suffix
    if domain and domain.strip() and domain.lower() != "unknown":
        esc_dom = re.escape(domain.strip())
        text = re.sub(rf'^{esc_dom}\s*[-–—:|/]\s*', '', text, flags=re.IGNORECASE).strip()
        text = re.sub(rf'\s*[-–—:|/]\s*{esc_dom}$', '', text, flags=re.IGNORECASE).strip()

    # 4. Clean leading and trailing punctuation and trailing prepositions
    text = text.strip(" -–—:|/,.#'\"")
    text = re.sub(r'\s+(?:of|at|in|for|on|by|with|to|from)$', '', text, flags=re.IGNORECASE).strip()
    text = text.strip(" -–—:|/,.#'\"")

    if not text:
        return "General"

    # 5. Check canonical dictionary remap
    clean_lower = text.lower().strip()
    if clean_lower in CANONICAL_TOPIC_REMAP:
        return CANONICAL_TOPIC_REMAP[clean_lower]

    # Title case words cleanly
    return text.title()


def assign_topic(
    narrative_text: str, 
    working_topics: List[ExistingTopic], 
    context: EntityContext,
    run_id: str = None
) -> Tuple[str, str, bool]:
    """
    Assigns a canonical topic using Groq SLM, strict entity/domain separation,
    semantic deduplication, and prevents duplicates across different entities.
    Returns: (topic_id, topic_name, is_new_topic)
    """
    # Sanitize working topics list to remove any legacy entity prefixes
    clean_working_topics: List[Tuple[ExistingTopic, str]] = []
    seen_clean_names = set()

    for t in working_topics:
        c_name = sanitize_topic_name(t.name, context.entity_name, context.domain)
        if c_name.lower() not in seen_clean_names:
            seen_clean_names.add(c_name.lower())
            clean_working_topics.append((t, c_name))

    existing_list = [f"- {c_name}" for _, c_name in clean_working_topics]
    existing_str = "\n".join(existing_list) if existing_list else "None"
    
    prompt = f"""You are an expert taxonomy classification system.
Entity: {context.entity_name} ({context.entity_type})
Domain: {context.domain}

Analyze this narrative and assign a concise, generic, reusable topic (2-5 words).
Narrative: "{narrative_text}"

Existing Topics:
{existing_str}

CRITICAL RULES:
1. Topic names MUST describe the SUBJECT matter, NOT the entity or domain.
2. NEVER include the entity name ('{context.entity_name}') or domain ('{context.domain}') in the topic name (NO entity prefixes, suffixes, or mentions).
   Examples of correct topics: 'Infrastructure & Facilities', 'Placements & Careers', 'Hostel & Accommodation', 'Examinations', 'Campus Events', 'Student Experience', 'Institutional Partnerships'.
3. Prefer reusing an existing topic if it covers the same broad subject.
4. If reusing, output the EXACT topic name and set is_new_topic=False.
5. If no existing topic fits, create a new canonical topic without any entity or institution name.
6. Output ONLY the topic name string without any IDs, prefixes, or explanations.

Respond ONLY with a JSON object matching this schema:
{{
  "topic_name": "string (canonical name of topic)",
  "is_new_topic": boolean
}}
"""

    model = os.getenv("GROQ_TOPIC_MODEL", "llama-3.1-8b-instant")
    proposed_name = "General"
    is_new = True

    try:
        client = get_groq_client()
        messages = [
            {"role": "system", "content": "You are an expert taxonomy classification system. Output valid JSON strictly. Never include entity or domain names in topic names."},
            {"role": "user", "content": prompt}
        ]
        response = groq_chat_completion_with_retry(
            client=client,
            messages=messages,
            model=model,
            response_format={"type": "json_object"},
            temperature=0.1,
            max_retries=3,
            timeout=20.0,
            run_id=run_id,
            stage_name="Groq-Topic-Assignment",
            items_count=1
        )
        raw_text = response.choices[0].message.content.strip()
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        if raw_text.startswith("```"):
            raw_text = raw_text[3:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
        raw_text = raw_text.strip()

        result = TopicResult.model_validate_json(raw_text)
        proposed_name = sanitize_topic_name(result.topic_name, context.entity_name, context.domain)
        is_new = result.is_new_topic
    except Exception as e:
        print(f"[TopicAssignment] Groq topic assignment ({model}) failed: {e}. Falling back to default.")
        proposed_name = "General"
        is_new = True

    if not proposed_name or proposed_name.lower() in ("unknown", "general", ""):
        proposed_name = "General"

    # Semantic matching and duplicate prevention across working topics
    sem_model = get_model()
    candidate_emb = sem_model.encode(proposed_name).reshape(1, -1)
    
    best_id = None
    best_name = None
    best_score = -1.0
    threshold = 0.82
    
    def norm(t): return t.strip().lower().translate(str.maketrans('', '', string.punctuation))

    for orig_t, c_name in clean_working_topics:
        if norm(c_name) == norm(proposed_name):
            return orig_t.topic_id, c_name, False
            
        en_emb = sem_model.encode(c_name).reshape(1, -1)
        score = cosine_similarity(candidate_emb, en_emb)[0][0]
        if score > best_score and score >= threshold:
            best_score = score
            best_id = orig_t.topic_id
            best_name = c_name
            
    if best_id:
        return best_id, best_name, False
        
    new_id = f"TOPIC_{uuid.uuid4().hex[:8]}"
    return new_id, proposed_name, True
