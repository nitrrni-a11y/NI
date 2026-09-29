import os
import uuid
from typing import List

from dotenv import load_dotenv
from google import genai
from pydantic import BaseModel, Field
from sklearn.metrics.pairwise import cosine_similarity

from app.pipeline.schemas import ClaimGroup, ExistingNarrative, Narrative
from app.pipeline.claim_enrichment import get_model
from app.pipeline.gemini_utils import generate_with_retry

load_dotenv()


class GeminiNarrativeResult(BaseModel):
    narrative: str = Field(
        description="A single concise sentence summarizing the underlying narrative of the claims."
    )
    confidence: float = Field(
        description="A confidence score between 0.0 and 1.0 reflecting how unified the claims are."
    )


_client = None


def get_gemini_client():
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY not found. Please add it to your .env file."
            )
        _client = genai.Client(api_key=api_key)
    return _client


def resolve_identity(
    candidate_id: str,
    candidate_text: str,
    existing_narratives: List[ExistingNarrative],
    threshold: float = 0.85,
) -> str:
    if not existing_narratives or not candidate_text.strip():
        return candidate_id

    model = get_model()
    candidate_emb = model.encode(candidate_text).reshape(1, -1)

    best_id = candidate_id
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


def generate_and_resolve_narratives(
    groups: List[ClaimGroup], existing_narratives: List[ExistingNarrative]
) -> List[Narrative]:
    if not groups:
        return []

    client = get_gemini_client()
    narratives = []

    for group in groups:
        if not group.claim_texts:
            continue

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
{group.claim_texts}
"""
        try:
            from google.genai import types
            response = generate_with_retry(
                client=client,
                model="gemini-3.6-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=GeminiNarrativeResult,
                ),
            )

            result = GeminiNarrativeResult.model_validate_json(response.text)

            candidate_text = result.narrative.strip()
            candidate_id = f"NAR_{uuid.uuid4().hex[:8]}"

            final_id = resolve_identity(
                candidate_id, candidate_text, existing_narratives
            )

            narratives.append(
                Narrative(
                    narrative_id=final_id,
                    text=candidate_text,
                    claim_ids=group.claim_ids,
                    confidence=round(max(0.0, min(1.0, result.confidence)), 4),
                )
            )

        except Exception as e:
            raise RuntimeError(f"Gemini narrative generation failed: {e}")

    return narratives
