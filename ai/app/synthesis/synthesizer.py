import os
import json
from typing import Dict, Any, List

from dotenv import load_dotenv
from google import genai
from pydantic import BaseModel, Field


# ============================================================
# FINAL LLM SYNTHESIS
# ============================================================
#
# Purpose:
# Takes all structured pipeline results and generates a final
# human-readable intelligence brief using Google's Gemini API.
#
# Input:
#   All processed pipeline data:
#   claims, sentiments, stances, groupings, narratives,
#   cross-source analysis, scores, trends, etc.
#
# Output:
#   A structured intelligence brief containing:
#   - Summary
#   - Key Narratives
#   - Supporting Evidence
#   - Important Sources
#   - Observations
#   - Limitations
#
# ============================================================

load_dotenv()


class SynthesisResult(BaseModel):
    summary: str = Field(
        description="A high-level executive summary of the analyzed data."
    )

    key_narratives: List[str] = Field(
        description="The most prominent narratives identified in the data."
    )

    supporting_evidence: List[str] = Field(
        description="Raw claims from the provided data that support the key narratives."
    )

    important_sources: List[str] = Field(
        description="Important sources or platforms represented in the data."
    )

    observations: List[str] = Field(
        description="Analytical observations based strictly on the provided trends, scores, sentiment, and stance."
    )

    limitations: List[str] = Field(
        description="Data gaps, uncertainty, low-confidence areas, or limitations present in the analysis."
    )


_client = None


def get_gemini_client():
    global _client

    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")

        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY not found. "
                "Please add it to your .env file."
            )

        _client = genai.Client(api_key=api_key)

    return _client


def generate_synthesis(
    structured_results: Dict[str, Any]
) -> Dict[str, Any]:

    if not structured_results:
        return {}

    client = get_gemini_client()

    prompt = f"""
You are an intelligence analyst.

Analyze the following structured results produced by an NLP
and narrative analysis pipeline and create a final intelligence brief.

CRITICAL RULES:

1. Use ONLY information present in the provided data.
2. Do NOT invent claims, sources, events, numbers, or facts.
3. Clearly distinguish supporting evidence from analytical observations.
4. Key narratives must represent narratives already present in the data.
5. Supporting evidence must come from the provided claims.
6. Important sources must come from the provided source information.
7. Observations may interpret trends, scores, sentiment, or stance,
   but must remain strictly grounded in the data.
8. Mention uncertainty or missing information in limitations.
9. Keep the summary concise and understandable.
10. Return only the requested structured result.

Structured pipeline data:

{json.dumps(structured_results, indent=2)}
"""

    try:
        interaction = client.interactions.create(
            model="gemini-3.6-flash",
            input=prompt,
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": SynthesisResult.model_json_schema()
            }
        )

        result = SynthesisResult.model_validate_json(
            interaction.output_text
        )

        return result.model_dump()

    except Exception as e:
        raise RuntimeError(
            f"Gemini final synthesis failed: {e}"
        )