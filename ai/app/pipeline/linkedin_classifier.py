import os
import json
import re
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv

from app.pipeline.groq_utils import get_groq_client, groq_chat_completion_with_retry
from app.pipeline.schemas import (
    LinkedInPostToClassify,
    LinkedInPostClassification,
    LinkedInClassifyResponse,
)

load_dotenv(override=True)

DEFAULT_GROQ_MODEL = "llama-3.1-8b-instant"
MAX_BATCH_POST_CHARS = 800

VALID_CLASSIFICATIONS = {
    "Relevant Opinion",
    "News / Announcement",
    "Irrelevant",
    "Uncertain",
}

VALID_OPINION_TYPES = {
    "Complaint / Criticism",
    "Praise / Positive Feedback",
    "Personal Experience",
    "Suggestion / Recommendation",
    "Inquiry / Discussion",
    "None",
}

CLASSIFICATION_GUIDE = """CLASSIFICATION CATEGORIES:
1. "Relevant Opinion":
   - Personal experiences of students, employees, alumni, or visitors with the target organisation.
   - Complaints, dissatisfaction, operational shortcomings, or criticism about the organisation.
   - Praise, appreciation, positive feedback, or satisfaction regarding the organisation.
   - Suggestions, recommendations, or constructive feedback for the organisation's management.
   - Inquiries, discussions, or questions directly concerning policies, admissions, placements, or life at the organisation.

2. "News / Announcement":
   - Official institutional updates, inaugurations, press releases, or administrative notices.
   - Event notifications, webinars, conferences, or workshops without personal commentary.
   - News reports or factual achievements/awards without personal opinion.
   - Promotional, recruitment, or corporate marketing posts.

3. "Irrelevant":
   - Incidental mentions (e.g., author merely lists the organisation in their bio or resume in passing).
   - Posts primarily discussing unrelated topics, third-party software, or other organisations.
   - Generic marketing or content with no substantive connection to the organisation.

CRITICAL RULES:
- The post MUST be directly about the target organisation or its aliases, NOT merely mention its name in passing.
- Do NOT reject a post merely because it is positive (praise is a valid relevant opinion).
- Do NOT reject a question simply because it is not a declarative statement (e.g., asking how placements are at the organisation MUST be classified as "Relevant Opinion" with opinion_type: "Inquiry / Discussion").
- Do NOT confuse an organisation's official announcement with an individual's personal opinion.
- If the post text is ambiguous, borderline, or you cannot confidently decide, classify as "Uncertain"."""


def _is_json_mode_bad_request(err: Exception) -> bool:
    """Detect Groq HTTP 400 / BadRequestError / json_validate_failed failures."""
    try:
        from groq import BadRequestError
        if isinstance(err, BadRequestError):
            return True
    except Exception:
        pass

    status_code = getattr(err, "status_code", None) or getattr(err, "code", None)
    err_str = str(err).lower()
    return (
        status_code == 400
        or type(err).__name__ == "BadRequestError"
        or "json_validate_failed" in err_str
        or "failed to validate json" in err_str
    )


def _extract_json_dict(raw_content: str) -> Dict[str, Any]:
    """Parse JSON from raw Groq text output, falling back to regex extraction."""
    cleaned = (raw_content or "").strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    match = re.search(r"\{[\s\S]*\}", cleaned)
    if not match:
        raise ValueError("No valid JSON object found in Groq response.")

    parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("Extracted JSON root must be an object.")
    return parsed


def _invoke_groq_json(
    client,
    messages: List[Dict[str, str]],
    model: str,
    timeout: float,
    stage_name: str,
    items_count: int,
) -> Dict[str, Any]:
    """
    Execute Groq JSON completion with native json_object mode and a resilient fallback
    retrying once without response_format if BadRequestError / json_validate_failed occurs.
    """
    try:
        response = groq_chat_completion_with_retry(
            client=client,
            messages=messages,
            model=model,
            response_format={"type": "json_object"},
            temperature=0.1,
            max_retries=2,
            timeout=timeout,
            stage_name=stage_name,
            items_count=items_count,
        )
        return _extract_json_dict(response.choices[0].message.content)
    except Exception as e:
        if not _is_json_mode_bad_request(e):
            raise

        print(
            f"[LinkedInClassifier] Groq json_object validation failed ({e}); "
            f"retrying without response_format and extracting JSON via regex."
        )
        fallback_response = groq_chat_completion_with_retry(
            client=client,
            messages=messages,
            model=model,
            response_format=None,
            temperature=0.1,
            max_retries=1,
            timeout=timeout,
            stage_name=f"{stage_name}-Fallback",
            items_count=items_count,
        )
        return _extract_json_dict(fallback_response.choices[0].message.content)


def _normalize_opinion_type(raw_opinion_type: Any, classification: str) -> str:
    """Normalize enum and close synonym variants into VALID_OPINION_TYPES."""
    raw = str(raw_opinion_type or "None").strip()
    if raw in VALID_OPINION_TYPES:
        return raw

    lower = raw.lower()
    if "praise" in lower or "positive" in lower:
        return "Praise / Positive Feedback"
    if "complaint" in lower or "criticism" in lower or "negative" in lower:
        return "Complaint / Criticism"
    if "inquiry" in lower or "question" in lower or "discussion" in lower:
        return "Inquiry / Discussion"
    if "suggestion" in lower or "recommend" in lower:
        return "Suggestion / Recommendation"
    if "experience" in lower:
        return "Personal Experience"
    return "None" if classification != "Relevant Opinion" else "Personal Experience"


def _normalize_post_classification(
    post: LinkedInPostToClassify,
    parsed: Dict[str, Any],
) -> LinkedInPostClassification:
    """Normalize parsed classification dictionary into validated LinkedInPostClassification."""
    classification = parsed.get("classification", "Uncertain")
    if classification not in VALID_CLASSIFICATIONS:
        c_lower = str(classification).lower()
        if "opinion" in c_lower or "relevant" in c_lower:
            classification = "Relevant Opinion"
        elif "news" in c_lower or "announcement" in c_lower:
            classification = "News / Announcement"
        elif "irrelevant" in c_lower or "unrelated" in c_lower:
            classification = "Irrelevant"
        else:
            classification = "Uncertain"

    is_directly = bool(parsed.get("is_directly_about_organisation", False))
    contains_op = bool(parsed.get("contains_opinion", False))
    opinion_type = _normalize_opinion_type(parsed.get("opinion_type", "None"), classification)

    # Explicitly ensure inquiries/questions about the organisation map to Relevant Opinion
    post_lower = (post.text or "").lower()
    if opinion_type == "Inquiry / Discussion" and (
        is_directly or "nit" in post_lower or "placement" in post_lower
    ):
        classification = "Relevant Opinion"
        is_directly = True
        contains_op = True

    # Reconcile flags consistently with final category
    if classification == "Relevant Opinion":
        is_directly = True
        contains_op = True
    elif classification == "News / Announcement":
        is_directly = True
        contains_op = False
    elif classification == "Irrelevant":
        is_directly = False
        contains_op = False

    reason = str(parsed.get("reason", "")).strip()
    if not reason:
        reason = f"Classified as {classification} based on content evaluation."

    requires_manual = (classification == "Uncertain")

    return LinkedInPostClassification(
        id=post.id,
        classification=classification,
        is_directly_about_organisation=is_directly,
        contains_opinion=contains_op,
        opinion_type=opinion_type,
        reason=reason,
        requires_manual_inspection=requires_manual,
    )


def classify_single_post(
    post: LinkedInPostToClassify,
    organisation_name: str,
    aliases: List[str],
    client,
    model: str,
) -> LinkedInPostClassification:
    """
    Classify a single LinkedIn post for direct opinions about the organization using Groq SLM.
    """
    aliases_str = ", ".join([f'"{a}"' for a in aliases]) if aliases else "None"

    system_prompt = (
        "You are an expert opinion and sentiment analyst for Narrative Intelligence.\n"
        "Your task is to analyze whether a LinkedIn post directly expresses an opinion, experience, "
        "judgment, criticism, praise, suggestion, or inquiry about a specific target organisation.\n"
        "Output ONLY a valid JSON object strictly following the required schema."
    )

    user_prompt = f"""Target Organisation: "{organisation_name}"
Alternative Names / Aliases: [{aliases_str}]

Analyze this LinkedIn post and determine if it contains a DIRECT OPINION, EXPERIENCE, JUDGEMENT, CRITICISM, PRAISE, SUGGESTION, or QUESTION ABOUT THE SPECIFIED TARGET ORGANISATION.

{CLASSIFICATION_GUIDE}

Post Text:
\"\"\"{(post.text or "").strip()[:MAX_BATCH_POST_CHARS]}\"\"\"

Respond ONLY with a JSON object matching this schema:
{{
  "classification": "Relevant Opinion" | "News / Announcement" | "Irrelevant" | "Uncertain",
  "is_directly_about_organisation": boolean,
  "contains_opinion": boolean,
  "opinion_type": "Complaint / Criticism" | "Praise / Positive Feedback" | "Personal Experience" | "Suggestion / Recommendation" | "Inquiry / Discussion" | "None",
  "reason": "string (concise 1-2 sentence explanation of why this post was classified this way)"
}}
"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    try:
        parsed = _invoke_groq_json(
            client=client,
            messages=messages,
            model=model,
            timeout=25.0,
            stage_name="Groq-LinkedIn-Opinion-Classification",
            items_count=1,
        )
        return _normalize_post_classification(post, parsed)
    except Exception as e:
        print(f"[LinkedInClassifier] Groq classification failed for post {post.id}: {e}")
        return LinkedInPostClassification(
            id=post.id,
            classification="Uncertain",
            is_directly_about_organisation=False,
            contains_opinion=False,
            opinion_type="None",
            reason=f"Model evaluation encountered an error: {str(e)[:120]}. Marked for manual inspection.",
            requires_manual_inspection=True,
        )


def classify_posts_batch(
    posts_chunk: List[LinkedInPostToClassify],
    organisation: str,
    aliases: List[str],
    client=None,
    model: Optional[str] = None,
) -> Dict[str, LinkedInPostClassification]:
    """
    Classify a batch chunk of LinkedIn posts in a single Groq API call to minimize token usage
    and stay comfortably within Groq's 6,000 TPM free-tier limit.
    Returns a mapping from post_id -> LinkedInPostClassification for every ID returned cleanly.
    """
    if not posts_chunk:
        return {}

    if client is None:
        client = get_groq_client()
    if not model:
        model = os.getenv("GROQ_TOPIC_MODEL", DEFAULT_GROQ_MODEL)

    aliases_str = ", ".join([f'"{a}"' for a in aliases]) if aliases else "None"
    post_map: Dict[str, LinkedInPostToClassify] = {str(p.id): p for p in posts_chunk}

    formatted_posts = []
    for post in posts_chunk:
        truncated_text = (post.text or "").strip()[:MAX_BATCH_POST_CHARS]
        formatted_posts.append(
            f"--- POST ID: {post.id} ---\n{truncated_text}"
        )
    posts_block = "\n\n".join(formatted_posts)

    system_prompt = (
        "You are an expert opinion and sentiment analyst for Narrative Intelligence.\n"
        "Analyze each delimited LinkedIn post in the batch and determine whether it directly expresses "
        "an opinion, experience, judgment, criticism, praise, suggestion, or inquiry about the specified target organisation.\n"
        "Output ONLY a valid JSON object containing a \"results\" array with exactly one object per POST ID."
    )

    user_prompt = f"""Target Organisation: "{organisation}"
Alternative Names / Aliases: [{aliases_str}]

{CLASSIFICATION_GUIDE}

Classify EVERY post below. Preserve each exact "post_id".

{posts_block}

Respond ONLY with a single JSON object matching this schema:
{{
  "results": [
    {{
      "post_id": "...",
      "is_directly_about_organisation": true,
      "contains_opinion": true,
      "classification": "Relevant Opinion" | "News / Announcement" | "Irrelevant" | "Uncertain",
      "opinion_type": "Complaint / Criticism" | "Praise / Positive Feedback" | "Personal Experience" | "Suggestion / Recommendation" | "Inquiry / Discussion" | "None",
      "confidence": 0.9,
      "reason": "Brief 1-sentence explanation"
    }}
  ]
}}
"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    try:
        parsed = _invoke_groq_json(
            client=client,
            messages=messages,
            model=model,
            timeout=35.0,
            stage_name="Groq-LinkedIn-Opinion-Batch",
            items_count=len(posts_chunk),
        )
    except Exception as e:
        print(f"[LinkedInClassifier] Groq batch call failed for {len(posts_chunk)} posts ({e}); falling back to single-post mode.")
        return {}

    raw_items = parsed.get("results")
    if not isinstance(raw_items, list):
        raw_items = parsed.get("classified_posts") if isinstance(parsed.get("classified_posts"), list) else []

    results_by_id: Dict[str, LinkedInPostClassification] = {}
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        pid = str(item.get("post_id") or item.get("id") or "").strip()
        if not pid or pid not in post_map:
            continue
        results_by_id[pid] = _normalize_post_classification(post_map[pid], item)

    return results_by_id


def classify_linkedin_posts(
    organisation_name: str,
    aliases: List[str],
    posts: List[LinkedInPostToClassify],
) -> LinkedInClassifyResponse:
    """
    Classify a list of LinkedIn posts using batched Groq calls (Llama-3.1-8B by default),
    falling back to single-post classification only for any post omitted or failed in a batch.
    """
    if not posts:
        return LinkedInClassifyResponse(classified_posts=[])

    model = os.getenv("GROQ_TOPIC_MODEL", DEFAULT_GROQ_MODEL)
    batch_size = max(1, int(os.getenv("GROQ_LINKEDIN_BATCH_SIZE", "8")))
    client = get_groq_client()

    classified_results: List[LinkedInPostClassification] = []

    for start in range(0, len(posts), batch_size):
        chunk = posts[start:start + batch_size]
        batch_map = classify_posts_batch(
            posts_chunk=chunk,
            organisation=organisation_name,
            aliases=aliases,
            client=client,
            model=model,
        )

        for post in chunk:
            matched = batch_map.get(str(post.id))
            if matched is not None:
                classified_results.append(matched)
            else:
                print(f"[LinkedInClassifier] Missing batch classification for post {post.id}; falling back to classify_single_post().")
                classified_results.append(
                    classify_single_post(
                        post=post,
                        organisation_name=organisation_name,
                        aliases=aliases,
                        client=client,
                        model=model,
                    )
                )

    return LinkedInClassifyResponse(classified_posts=classified_results)
