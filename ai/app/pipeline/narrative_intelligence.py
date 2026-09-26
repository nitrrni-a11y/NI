import os
import json
from typing import List, Tuple

from dotenv import load_dotenv
from google import genai
from pydantic import BaseModel, Field

from app.pipeline.schemas import Narrative, NarrativeEvidence, NarrativeAnalysis, FinalNarrative

load_dotenv()

class IntelligenceResult(BaseModel):
    intelligence: str = Field(description="Concise intelligence summary for this specific narrative, grounded strictly in the provided evidence and analysis.")
    recommendation: str = Field(description="Actionable recommendation if evidence is sufficient. Otherwise, state that evidence is insufficient for a strong recommendation.")

_client = None

def get_gemini_client():
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not found. Please add it to your .env file.")
        _client = genai.Client(api_key=api_key)
    return _client

def generate_intelligence(analyzed_data: List[Tuple[Narrative, NarrativeEvidence, NarrativeAnalysis]]) -> List[FinalNarrative]:
    if not analyzed_data:
        return []

    client = get_gemini_client()
    final_narratives = []
    
    from google.genai import types

    for narrative, evidence, analysis in analyzed_data:
        
        prompt = f"""
You are an intelligence analyst.

Analyze the following persistent narrative and its supporting evidence to generate a focused intelligence summary and an actionable recommendation.

CRITICAL RULES:
1. Focus ONLY on this specific narrative.
2. The intelligence summary must be grounded in the provided analysis (e.g., claim count, sentiment, trend, cross-source presence).
3. Do NOT invent claims, sources, events, numbers, or facts.
4. The recommendation MUST be actionable and based on the evidence.
5. If the evidence is weak (e.g., only 1 claim, low confidence, single source), the recommendation MUST explicitly state that there is insufficient evidence for a strong recommendation, and suggest monitoring.

Data:
Narrative: {narrative.text}
Claim Count: {analysis.claim_count}
Source Count: {analysis.source_count}
Sources: {', '.join(evidence.sources) if evidence.sources else 'Unknown'}
Sentiment (avg, -1 to 1): {analysis.sentiment}
Trend: {analysis.recurrence}
Strength Score (0 to 1): {analysis.strength}
"""

        try:
            response = client.models.generate_content(
                model="gemini-3.6-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=IntelligenceResult,
                )
            )

            result = IntelligenceResult.model_validate_json(response.text)
            
            final_narratives.append(FinalNarrative(
                narrative_id=narrative.narrative_id,
                narrative=narrative.text,
                supporting_evidence=evidence,
                analysis=analysis,
                intelligence=result.intelligence.strip(),
                recommendation=result.recommendation.strip()
            ))

        except Exception as e:
            raise RuntimeError(f"Gemini narrative intelligence generation failed: {e}")

    return final_narratives
