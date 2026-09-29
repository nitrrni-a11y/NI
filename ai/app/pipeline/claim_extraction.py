import os
import uuid
from typing import List

from dotenv import load_dotenv
from google import genai
from pydantic import BaseModel

from app.pipeline.schemas import PreprocessedDocument, Claim
from app.pipeline.gemini_utils import generate_with_retry

load_dotenv()

class GeminiClaim(BaseModel):
    text: str
    
class GeminiClaimResult(BaseModel):
    claims: list[GeminiClaim]

_client = None

def get_gemini_client():
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not found. Please add it to your .env file.")
        _client = genai.Client(api_key=api_key)
    return _client

def extract_claims(doc: PreprocessedDocument) -> List[Claim]:
    if not doc.text.strip():
        return []

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
{doc.text}
"""

    try:
        from google.genai import types
        response =generate_with_retry(
            client=client,
            model="gemini-3.6-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=GeminiClaimResult,
            )
        )

        result = GeminiClaimResult.model_validate_json(response.text)

        claims = []
        for i, item in enumerate(result.claims):
            claim_text = item.text.strip()
            if not claim_text:
                continue

            uid = uuid.uuid4().hex[:6]
            claims.append(Claim(
                claim_id=f"CLM_{str(i + 1).zfill(3)}_{uid}",
                document_id=doc.document_id,
                text=claim_text,
                source_metadata={
                    "source": doc.source,
                    "source_type": doc.source_type,
                    "author": doc.author,
                    "published_at": doc.published_at,
                    "collected_at": doc.collected_at
                }
            ))

        return claims

    except Exception as e:
        raise RuntimeError(f"Gemini claim extraction failed: {e}")
