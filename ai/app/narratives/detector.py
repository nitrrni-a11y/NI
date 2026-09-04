import os
import uuid
from typing import Dict, Any

from dotenv import load_dotenv
from google import genai
from pydantic import BaseModel, Field


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()


# ============================================================
# NARRATIVE DETECTION
# ============================================================
#
# Purpose:
# Identifies the overarching narrative represented by a group of
# semantically similar claims.
#
# Input:
# Dict containing group_id, claim_ids, and claim_texts.
#
# Output:
# Dict with the narrative_id, the generated narrative text,
# the original claim IDs, and a confidence score.
#
# Why:
# Claims are atomic facts, while a narrative represents the broader
# idea connecting multiple related claims.
#
# Example:
#
# Claims:
#   "Placement statistics improved."
#   "More students received higher packages."
#
# Narrative:
#   "NIT Raipur's placement outcomes have improved."
#
# Implementation:
# Uses Google's Gemini model to synthesize a concise narrative
# from the grouped claims.
# Pydantic is used to define and validate Gemini's structured output.
# The original claim IDs are preserved so the narrative can always
# be traced back to its supporting claims.
#
# ============================================================


# ============================================================
# PYDANTIC MODEL
# ============================================================

class GeminiNarrativeResult(BaseModel):
    narrative: str = Field(
        description="A single concise sentence summarizing the underlying narrative of the claims."
    )
    confidence: float = Field(
        description="A confidence score between 0.0 and 1.0 reflecting how unified the claims are."
    )


# ============================================================
# GEMINI CLIENT
# ============================================================

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


# ============================================================
# NARRATIVE DETECTION
# ============================================================

def detect_narrative(claim_group: Dict[str, Any]) -> Dict[str, Any]:
    """
    Detects a broader narrative from a group of related claims.

    Args:
        claim_group (Dict): Contains 'group_id', 'claim_ids',
                            and 'claim_texts'.

    Returns:
        Dict: Structured narrative result.
    """

    if (
        not claim_group
        or "claim_texts" not in claim_group
        or not claim_group["claim_texts"]
    ):
        return {}

    group_id = claim_group.get("group_id", "UNKNOWN")
    claim_ids = claim_group.get("claim_ids", [])
    claim_texts = claim_group["claim_texts"]

    client = get_gemini_client()

    prompt = f"""
Analyze the following group of semantically related claims.

Your task is to identify the single broader narrative that connects
these claims.

Rules:
1. Create one concise narrative sentence.
2. The narrative must be strictly grounded in the provided claims.
3. Do not invent facts or information.
4. Do not add information that is not present in the claims.
5. Preserve the overall meaning of the claims.
6. The narrative should describe the common idea represented by the group.
7. Give a confidence score between 0.0 and 1.0 based on how strongly
   the claims represent one unified narrative.

Claims:
{claim_texts}
"""

    try:
        interaction = client.interactions.create(
            model="gemini-3.6-flash",
            input=prompt,
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": GeminiNarrativeResult.model_json_schema()
            }
        )

        result = GeminiNarrativeResult.model_validate_json(
            interaction.output_text
        )

        narrative_id = f"NAR_{uuid.uuid4().hex[:8]}"

        return {
            "narrative_id": narrative_id,
            "narrative": result.narrative.strip(),
            "claim_ids": claim_ids,
            "confidence": round(
                max(0.0, min(1.0, result.confidence)),
                4
            )
        }

    except Exception as e:
        raise RuntimeError(
            f"Gemini narrative detection failed: {e}"
        )