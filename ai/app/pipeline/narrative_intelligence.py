import os
import uuid
from typing import List, Optional

from dotenv import load_dotenv
from google import genai
from pydantic import BaseModel, Field
from sklearn.metrics.pairwise import cosine_similarity

from app.pipeline.schemas import (
    ClaimGroup,
    ExistingNarrative,
    FinalNarrative,
    NarrativeEvidence,
    NarrativeAnalysis,
    EnrichedClaim,
    EntityContext
)
from app.pipeline.claim_enrichment import get_model
from app.pipeline.gemini_utils import generate_with_retry

load_dotenv()

class GeminiNewNarrativeResult(BaseModel):
    narrative: str = Field(description="Specific recurring perspective/idea supported by the claims.")
    intelligence: str = Field(description="Concise intelligence summary grounded in the provided analysis.")
    recommendation: str = Field(description="Actionable recommendation based on evidence. State if evidence is weak.")

class GeminiUpdatedNarrativeResult(BaseModel):
    intelligence: str = Field(description="Updated concise intelligence summary.")
    recommendation: str = Field(description="Updated actionable recommendation.")


_client = None

def get_gemini_client():
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not found. Please add it to your .env file.")
        _client = genai.Client(api_key=api_key)
    return _client


def resolve_identity(candidate_text: str, existing_narratives: List[ExistingNarrative], threshold: float = 0.85) -> Optional[str]:
    if not existing_narratives or not candidate_text.strip():
        return None

    model = get_model()
    candidate_emb = model.encode(candidate_text).reshape(1, -1)

    best_id = None
    best_score = -1.0

    for en in existing_narratives:
        if not en.text or not en.narrative_id:
            continue

        en_emb = model.encode(en.text).reshape(1, -1)
        score = cosine_similarity(candidate_emb, en_emb)[0][0]

        if score > best_score and score >= threshold:
            best_score = score
            best_id = en.narrative_id

    return best_id


def generate_new_narrative(
    group: ClaimGroup, 
    evidence: NarrativeEvidence, 
    analysis: NarrativeAnalysis,
    analysis_context: EntityContext
) -> FinalNarrative:
    client = get_gemini_client()

    prompt = f"""
You are an intelligence analyst analyzing narratives for the following entity:
Entity Name: {analysis_context.entity_name}
Entity Type: {analysis_context.entity_type}
Domain: {analysis_context.domain}

Analyze this group of semantically related claims and their analysis data.
Make ONE call to generate the Topic, Narrative, Intelligence, and Recommendation.

CRITICAL RULES:
1. Narrative = specific recurring perspective/idea supported by the claims.
2. Intelligence must be strictly grounded in the provided analysis (e.g., claim count, sentiment, trend). Do not invent facts. Contextualize the intelligence for the entity.
3. Recommendation must be actionable for the entity. If evidence is weak (e.g., 1 claim, single source), explicitly state that evidence is insufficient for a strong recommendation and suggest monitoring.

Data:
Claims: {group.claim_texts}
Claim Count: {analysis.claim_count}
Source Count: {analysis.source_count}
Sentiment (avg, -1 to 1): {analysis.sentiment}
Trend: {analysis.recurrence}
Strength Score (0 to 1): {analysis.strength}
"""

    try:
        from google.genai import types
        response = generate_with_retry(
            client=client,
            model="gemini-3.5-flash-lite",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=GeminiNewNarrativeResult,
            ),
        )

        result = GeminiNewNarrativeResult.model_validate_json(response.text)
        
        narrative_id = f"NAR_{uuid.uuid4().hex[:8]}"

        return FinalNarrative(
            narrative_id=narrative_id,
            topic="",
            topic_id="",
            narrative=result.narrative.strip(),
            supporting_evidence=evidence,
            analysis=analysis,
            intelligence=result.intelligence.strip(),
            recommendation=result.recommendation.strip(),
            is_new_topic=False
        )

    except Exception as e:
        raise RuntimeError(f"Gemini new narrative generation failed: {e}")


def update_matched_narrative(
    existing: ExistingNarrative, 
    new_group_claims: List[EnrichedClaim],
    new_evidence: NarrativeEvidence,
    new_analysis: NarrativeAnalysis,
    analysis_context: EntityContext
) -> FinalNarrative:
    """
    Merge the old narrative state with the new claims, and use ONE LLM call to update intelligence.
    """
    client = get_gemini_client()
    
    # 1. Deterministic Merge
    combined_claim_count = existing.claim_count + new_analysis.claim_count
    
    combined_sources = list(set(existing.sources + new_evidence.sources))
    combined_source_count = len(combined_sources)
    
    # Simple weighted average for sentiment
    if combined_claim_count > 0:
        total_sentiment = (existing.sentiment * existing.claim_count) + (new_analysis.sentiment * new_analysis.claim_count)
        combined_sentiment = total_sentiment / combined_claim_count
    else:
        combined_sentiment = 0.0
        
    combined_claim_ids = list(set(existing.claim_ids + new_evidence.claim_ids))
    combined_document_ids = list(set(existing.document_ids + new_evidence.document_ids))
    
    # Since we can't easily recalculate temporal trend without all historical dates in memory, 
    # we conservatively fall back to the new trend or 'stable'.
    combined_trend = new_analysis.recurrence
    
    # Recalculate strength roughly
    import math
    vol_score = min(math.log10(combined_claim_count + 1) / 2.0, 1.0)
    div_score = min(combined_source_count / 5.0, 1.0)
    qual_score = abs(combined_sentiment)
    combined_strength = (0.50 * vol_score) + (0.30 * div_score) + (0.20 * qual_score)
    combined_strength = max(0.0, min(combined_strength, 1.0))
    
    merged_evidence = NarrativeEvidence(
        claim_ids=combined_claim_ids,
        document_ids=combined_document_ids,
        sources=combined_sources
    )
    
    merged_analysis = NarrativeAnalysis(
        claim_count=combined_claim_count,
        source_count=combined_source_count,
        sentiment=round(combined_sentiment, 4),
        temporal_information=new_analysis.temporal_information,
        recurrence=combined_trend,
        strength=round(combined_strength, 4)
    )

    prompt = f"""
You are an intelligence analyst analyzing narratives for the following entity:
Entity Name: {analysis_context.entity_name}
Entity Type: {analysis_context.entity_type}
Domain: {analysis_context.domain}

An existing narrative has received NEW supporting evidence.
Update the Intelligence and Recommendation using the COMBINED, updated statistics.

CRITICAL RULES:
1. Focus ONLY on this specific narrative and context.
2. Ground your intelligence strictly in the updated analysis (e.g., total claim count, combined sentiment, trend). Do not invent facts.
3. The recommendation MUST be actionable for the entity based on the combined evidence.
4. Output only the updated intelligence and recommendation.

Data:
Topic: {existing.topic}
Narrative: {existing.text}
Updated Claim Count: {merged_analysis.claim_count} (was {existing.claim_count})
Updated Source Count: {merged_analysis.source_count} (was {existing.source_count})
Updated Sentiment (avg, -1 to 1): {merged_analysis.sentiment}
Current Trend: {merged_analysis.recurrence}
Updated Strength Score (0 to 1): {merged_analysis.strength}

New Incoming Claims That Triggered This Update:
{[c.text for c in new_group_claims]}
"""

    try:
        from google.genai import types
        response = generate_with_retry(
            client=client,
            model="gemini-3.5-flash-lite",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=GeminiUpdatedNarrativeResult,
            ),
        )

        result = GeminiUpdatedNarrativeResult.model_validate_json(response.text)

        return FinalNarrative(
            narrative_id=existing.narrative_id,
            topic=existing.topic,
            narrative=existing.text,
            supporting_evidence=merged_evidence,
            analysis=merged_analysis,
            intelligence=result.intelligence.strip(),
            recommendation=result.recommendation.strip()
        )

    except Exception as e:
        raise RuntimeError(f"Gemini matched narrative update failed: {e}")

