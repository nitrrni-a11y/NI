import os
import json
import re
from typing import List
from dotenv import load_dotenv

from app.pipeline.groq_utils import get_groq_client, groq_chat_completion_with_retry
from app.pipeline.schemas import (
    LinkedInPostToClassify,
    LinkedInPostClassification,
    LinkedInClassifyResponse,
)

load_dotenv(override=True)

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


def classify_single_post(
    post: LinkedInPostToClassify,
    organisation_name: str,
    aliases: List[str],
    client,
    model: str,
) -> LinkedInPostClassification:
    """
    Classify a single LinkedIn post for direct opinions about the organization using Allam-2-7B.
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

CLASSIFICATION CATEGORIES:
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
- The post MUST be directly about "{organisation_name}", NOT merely mention its name in passing.
- Do NOT reject a post merely because it is positive (praise is a valid relevant opinion).
- Do NOT reject a question simply because it is not a declarative statement (e.g., "Does anyone know how placements are at NIT Raipur?" MUST be classified as "Relevant Opinion" with opinion_type: "Inquiry / Discussion").
- Do NOT confuse an organisation's official announcement with an individual's personal opinion.
- If the post text is ambiguous, borderline, or you cannot confidently decide, classify as "Uncertain".

Post Text:
\"\"\"{post.text.strip()}\"\"\"

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
        response = groq_chat_completion_with_retry(
            client=client,
            messages=messages,
            model=model,
            response_format={"type": "json_object"},
            temperature=0.1,
            max_retries=2,
            timeout=25.0,
            stage_name="Groq-LinkedIn-Opinion-Classification",
            items_count=1,
        )

        raw_content = response.choices[0].message.content.strip()
        if raw_content.startswith("```json"):
            raw_content = raw_content[7:]
        if raw_content.startswith("```"):
            raw_content = raw_content[3:]
        if raw_content.endswith("```"):
            raw_content = raw_content[:-3]
        raw_content = raw_content.strip()

        parsed = json.loads(raw_content)

        classification = parsed.get("classification", "Uncertain")
        if classification not in VALID_CLASSIFICATIONS:
            # Fallback fuzzy matching
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

        opinion_type = parsed.get("opinion_type", "None")
        if opinion_type not in VALID_OPINION_TYPES:
            opinion_type = "None" if classification != "Relevant Opinion" else "Personal Experience"

        # Explicitly ensure inquiries/questions about the organisation map to Relevant Opinion
        if opinion_type == "Inquiry / Discussion" and (is_directly or "nit" in post.text.lower() or "placement" in post.text.lower()):
            classification = "Relevant Opinion"
            is_directly = True
            contains_op = True

        # Reconcile flags
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


def classify_linkedin_posts(
    organisation_name: str,
    aliases: List[str],
    posts: List[LinkedInPostToClassify],
) -> LinkedInClassifyResponse:
    """
    Classify a list of LinkedIn posts using Allam-2-7B.
    """
    if not posts:
        return LinkedInClassifyResponse(classified_posts=[])

    model = os.getenv("GROQ_TOPIC_MODEL", "allam-2-7b")
    client = get_groq_client()

    classified_results = []
    for post in posts:
        result = classify_single_post(
            post=post,
            organisation_name=organisation_name,
            aliases=aliases,
            client=client,
            model=model,
        )
        classified_results.append(result)

    return LinkedInClassifyResponse(classified_posts=classified_results)
