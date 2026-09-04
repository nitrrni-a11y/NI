# ============================================================
# CLAIM EXTRACTION
# ============================================================
#
# Purpose:
# Extract atomic factual claims from cleaned text using
# Google's Gemini API.
#
# Input:
#   Cleaned text
#
# Output:
#   {
#       "claims": [
#           {
#               "claim_id": "CLM_001_xxxxxx",
#               "text": "..."
#           }
#       ]
#   }
#
# ============================================================

import os
import uuid
from typing import Dict, Any

from dotenv import load_dotenv
from google import genai
from pydantic import BaseModel


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()


# ============================================================
# PYDANTIC MODELS
# ============================================================

class GeminiClaim(BaseModel):
    text: str


class GeminiClaimResult(BaseModel):
    claims: list[GeminiClaim]


class Claim(BaseModel):
    claim_id: str
    text: str


class ClaimExtractionResult(BaseModel):
    claims: list[Claim]


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
# CLAIM EXTRACTION
# ============================================================

def extract_claims(text: str) -> Dict[str, Any]:

    if not isinstance(text, str) or not text.strip():
        return {"claims": []}

    client = get_gemini_client()

    prompt = f"""
Extract the important factual claims from the following text.

Rules:
1. Extract only meaningful factual claims.
2. Each claim must be atomic and independently understandable.
3. Do not add information that is not present in the text.
4. Do not include opinions, greetings, or unnecessary wording.
5. Preserve the meaning of the original text.
6. Return only the claims.

Text:
{text}
"""

    try:
        interaction = client.interactions.create(
            model="gemini-3.6-flash",
            input=prompt,
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": GeminiClaimResult.model_json_schema()
            }
        )

        result = GeminiClaimResult.model_validate_json(
            interaction.output_text
        )

        claims = []

        for i, item in enumerate(result.claims):

            claim_text = item.text.strip()

            if not claim_text:
                continue

            uid = uuid.uuid4().hex[:6]

            claims.append({
                "claim_id": f"CLM_{str(i + 1).zfill(3)}_{uid}",
                "text": claim_text
            })

        return {
            "claims": claims
        }

    except Exception as e:
        raise RuntimeError(
            f"Gemini claim extraction failed: {e}"
        )

