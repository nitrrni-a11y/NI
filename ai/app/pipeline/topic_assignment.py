import os
import uuid
from typing import List, Tuple
from google import genai
from pydantic import BaseModel, Field
from sklearn.metrics.pairwise import cosine_similarity
from dotenv import load_dotenv

from app.pipeline.schemas import ExistingTopic, EntityContext
from app.pipeline.claim_enrichment import get_model
from app.pipeline.gemini_utils import generate_with_retry

load_dotenv()

_client = None

def get_gemini_client():
    global _client
    if _client is None:
        _client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    return _client

class GemmaTopicResult(BaseModel):
    topic_name: str = Field(description="The canonical name of the topic. Must exactly match an existing topic if one was reused.")
    is_new_topic: bool = Field(description="True if you created a completely new topic, False if you reused an existing one.")

def assign_topic(narrative_text: str, working_topics: List[ExistingTopic], context: EntityContext) -> Tuple[str, str, bool]:
    """
    Assigns a topic using Gemma model, semantic matching, and prevents duplicates.
    Returns: (topic_id, topic_name, is_new_topic)
    """
    existing_list = [f"- {t.name} (ID: {t.topic_id})" for t in working_topics]
    existing_str = "\n".join(existing_list) if existing_list else "None"
    
    prompt = f"""
You are an expert taxonomy classification system.
Entity: {context.entity_name} ({context.entity_type})
Domain: {context.domain}

Analyze this narrative and assign a concise, domain-appropriate topic (2-5 words).
Narrative: "{narrative_text}"

Existing Topics:
{existing_str}

CRITICAL RULES:
1. Prefer reusing an existing topic if it covers the same broad subject.
2. If reusing, output the EXACT topic name and set is_new_topic=False.
3. If no existing topic fits, create a new one and set is_new_topic=True.
"""

    client = get_gemini_client()
    try:
        from google.genai import types
        response = generate_with_retry(
            client=client,
            model = "gemma-4-26b-a4b-it",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=GemmaTopicResult,
                temperature=0.1
            ),
        )
        result = GemmaTopicResult.model_validate_json(response.text)
        proposed_name = result.topic_name.strip()
        is_new = result.is_new_topic
    except Exception as e:
        print(f"Gemma topic assignment failed: {e}. Falling back to default.")
        proposed_name = "Unknown"
        is_new = True

    if not proposed_name or proposed_name == "Unknown":
        return f"TOPIC_{uuid.uuid4().hex[:8]}", "Unknown", True

    # Semantic matching and duplicate prevention
    model = get_model()
    candidate_emb = model.encode(proposed_name).reshape(1, -1)
    
    best_id = None
    best_name = None
    best_score = -1.0
    threshold = 0.85
    
    for ext in working_topics:
        import string
        def norm(t): return t.strip().lower().translate(str.maketrans('', '', string.punctuation))
        if norm(ext.name) == norm(proposed_name):
            return ext.topic_id, ext.name, False
            
        en_emb = model.encode(ext.name).reshape(1, -1)
        score = cosine_similarity(candidate_emb, en_emb)[0][0]
        if score > best_score and score >= threshold:
            best_score = score
            best_id = ext.topic_id
            best_name = ext.name
            
    if best_id:
        return best_id, best_name, False
        
    new_id = f"TOPIC_{uuid.uuid4().hex[:8]}"
    return new_id, proposed_name, True
