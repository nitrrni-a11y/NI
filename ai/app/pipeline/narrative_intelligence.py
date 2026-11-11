import os
import uuid
import math
import logging
from typing import List, Optional, Dict, Any, Tuple

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
from app.pipeline.gemini_utils import generate_with_retry, get_gemini_client
from app.pipeline.cancellation import cancellation_manager
from app.pipeline.narrative_analysis import analyze_narrative_trend, evaluate_display_eligibility, classify_narrative_context

load_dotenv(override=True)
logger = logging.getLogger(__name__)

# Configurable maximum batch size and model for Gemini LLM requests
DEFAULT_BATCH_SIZE = int(os.getenv("GEMINI_MAX_BATCH_SIZE", "5"))
GEMINI_NARRATIVE_MODEL = os.getenv("GEMINI_NARRATIVE_MODEL", "gemini-3.5-flash-lite")


# ============================================================
# STRUCTURED SCHEMAS FOR GEMINI RESPONSES
# ============================================================

class GeminiNewNarrativeResult(BaseModel):
    narrative: str = Field(description="Specific recurring perspective/idea supported by the claims.")
    intelligence: str = Field(description="Concise intelligence summary grounded strictly in the provided analysis.")
    recommendation: str = Field(description="Concrete, actionable operational recommendation directly addressing the narrative subject, or 'Insufficient information for an actionable recommendation.'")


class GeminiUpdatedNarrativeResult(BaseModel):
    intelligence: str = Field(description="Updated concise intelligence summary grounded strictly in the combined analysis.")
    recommendation: str = Field(description="Updated concrete actionable recommendation, or 'Insufficient information for an actionable recommendation.'")


class BatchedGroupNarrativeItem(BaseModel):
    group_id: str = Field(description="Exact group_id provided in the input prompt (e.g. GRP_001_xxxx).")
    narrative: str = Field(description="Specific recurring perspective/idea supported by this group's claims.")
    intelligence: str = Field(description="Concise intelligence summary grounded strictly in this group's analysis.")
    recommendation: str = Field(description="Concrete, actionable operational recommendation addressing the subject matter, or 'Insufficient information for an actionable recommendation.'")


class BatchedNarrativesResponse(BaseModel):
    results: List[BatchedGroupNarrativeItem] = Field(description="List of narrative and intelligence results, exactly one per input group.")


class BatchedMatchedUpdateItem(BaseModel):
    narrative_id: str = Field(description="Exact narrative_id provided in the input prompt (e.g. NAR_xxxx).")
    intelligence: str = Field(description="Updated concise intelligence summary.")
    recommendation: str = Field(description="Updated actionable operational recommendation, or 'Insufficient information for an actionable recommendation.'")


class BatchedMatchedUpdatesResponse(BaseModel):
    results: List[BatchedMatchedUpdateItem] = Field(description="List of updated intelligence results, exactly one per matched narrative.")


def _clean_recommendation(rec: str) -> str:
    """
    Cleans and standardizes recommendation text:
    - Replaces generic evidence-gathering/monitoring filler with standard response.
    - Strips inappropriate weather metaphors.
    """
    if not rec or not isinstance(rec, str):
        return "Insufficient information for an actionable recommendation."

    clean = rec.strip().strip('"\'')
    lower = clean.lower()

    # Detect generic evidence monitoring or verification cop-outs
    evidence_phrases = [
        "monitor evidence", "collect more evidence", "gather more evidence",
        "insufficient evidence to recommend", "evidence is weak", "gather more data",
        "verify claims before taking action", "check evidence", "monitor the situation",
        "monitor social media"
    ]
    if any(ep in lower for ep in evidence_phrases) and len(clean.split()) < 25:
        return "Insufficient information for an actionable recommendation."

    # Detect inappropriate weather filler when unrelated to meteorology
    weather_fillers = ["umbrella", "storm of complaints", "weather the storm", "dark clouds", "storm of criticism", "cloudy outlook"]
    if any(wf in lower for wf in weather_fillers):
        return "Insufficient information for an actionable recommendation."

    return clean if clean else "Insufficient information for an actionable recommendation."


# ============================================================
# IDENTITY RESOLUTION
# ============================================================

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


# ============================================================
# SINGLE NARRATIVE GENERATION (FALLBACK & INDIVIDUAL PROCESSING)
# ============================================================

def generate_new_narrative(
    group: ClaimGroup, 
    evidence: NarrativeEvidence, 
    analysis: NarrativeAnalysis,
    analysis_context: EntityContext,
    run_id: Optional[str] = None
) -> FinalNarrative:
    """
    Generates narrative, intelligence, and actionable recommendation for a single claim group using Gemini.
    Strictly forbids evidence-monitoring fluff or weather commentary.
    """
    client = get_gemini_client()

    prompt = f"""
You are an intelligence analyst analyzing narratives for the following entity:
Entity Name: {analysis_context.entity_name}
Entity Type: {analysis_context.entity_type}
Domain: {analysis_context.domain}

Analyze this group of semantically related claims and their analysis data.
Generate a Narrative, Intelligence summary, and Actionable Recommendation.

CRITICAL RULES:
1. Narrative: Specific recurring perspective/idea supported by the claims.
2. Intelligence: Concise summary strictly grounded in the provided analysis (claims, source count, sentiment, trend). Do not invent facts. Contextualize for the entity.
3. RECOMMENDATION RULES:
   - Propose concrete, actionable steps (operational, policy, administrative, facility maintenance, or communication).
   - Specify what action could be taken, who could take it (e.g. Administration, Placement Cell, Facilities Department, Academic Council), and what it aims to improve.
   - FORBIDDEN: Do NOT write generic statements about collecting evidence, checking evidence, verifying claims, or monitoring reviews.
   - FORBIDDEN: Do NOT include weather-related remarks or meteorological metaphors unless the narrative is literally about weather disruptions.
   - FORBIDDEN: Do NOT repeat the narrative description as the recommendation.
   - If the available claims are too vague, sparse, or trivial for a specific actionable recommendation, return EXACTLY:
     "Insufficient information for an actionable recommendation."

Data for Group {group.group_id}:
Claims: {group.claim_texts}
Claim Count: {analysis.claim_count}
Source Count: {analysis.source_count}
Sentiment (avg, -1 to 1): {analysis.sentiment}
Trend: {analysis.trend}
Strength Score (0 to 1): {analysis.strength}
"""

    try:
        from google.genai import types
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=GeminiNewNarrativeResult,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)
        )
        response = generate_with_retry(
            client=client,
            model=GEMINI_NARRATIVE_MODEL,
            contents=prompt,
            config=config,
            run_id=run_id,
            stage_name="Narrative-Gen-Individual",
            items_count=1
        )

        result = GeminiNewNarrativeResult.model_validate_json(response.text)
        narrative_id = f"NAR_{uuid.uuid4().hex[:8]}"

        rec_clean = _clean_recommendation(result.recommendation)

        return FinalNarrative(
            narrative_id=narrative_id,
            topic="",
            topic_id="",
            narrative=result.narrative.strip(),
            trend=analysis.trend,
            supporting_evidence=evidence,
            analysis=analysis,
            intelligence=result.intelligence.strip(),
            recommendation=rec_clean,
            is_new_topic=False,
            display_status=analysis.display_status,
            is_eligible=analysis.is_eligible,
            eligibility_reason=analysis.eligibility_reason,
            direction=analysis.direction,
            priority=analysis.priority,
            positive_significance=analysis.positive_significance,
            classification_reason=analysis.classification_reason,
            impact_indicators=analysis.impact_indicators
        )

    except Exception as e:
        raise RuntimeError(f"Gemini new narrative generation failed for group {group.group_id}: {e}")


# ============================================================
# BATCHED NARRATIVE GENERATION (OPTIMIZED PIPELINE STAGE)
# ============================================================

def generate_narratives_batched(
    work_items: List[Dict[str, Any]],
    analysis_context: EntityContext,
    batch_size: Optional[int] = None,
    run_id: Optional[str] = None
) -> List[FinalNarrative]:
    """
    Batches multiple independent claim groups into fewer Gemini LLM requests while preserving:
    - Independent narrative, intelligence, and recommendation for each group.
    - Stable 1-to-1 group_id input-to-output mapping.
    - Elimination of evidence-monitoring and weather-type filler in recommendations.
    - Graceful fallback to individual generation on parsing or partial response failures.
    """
    if not work_items:
        return []

    if batch_size is None:
        batch_size = int(os.getenv("GEMINI_MAX_BATCH_SIZE", str(DEFAULT_BATCH_SIZE)))

    if len(work_items) == 1:
        item = work_items[0]
        narrative = generate_new_narrative(
            group=item["group"],
            evidence=item["evidence"],
            analysis=item["analysis"],
            analysis_context=analysis_context,
            run_id=run_id
        )
        return [narrative]

    results: List[FinalNarrative] = []
    client = get_gemini_client()

    chunks = [work_items[i:i + batch_size] for i in range(0, len(work_items), batch_size)]

    for chunk_idx, chunk in enumerate(chunks):
        if run_id:
            cancellation_manager.check_cancelled(run_id)

        groups_text_blocks = []
        for it in chunk:
            grp: ClaimGroup = it["group"]
            ana: NarrativeAnalysis = it["analysis"]
            block = (
                f"--- GROUP ID: {grp.group_id} ---\n"
                f"Claims:\n"
                f"{grp.claim_texts}\n"
                f"Analysis:\n"
                f"- Claim Count: {ana.claim_count}\n"
                f"- Source Count: {ana.source_count}\n"
                f"- Sentiment (avg, -1 to 1): {ana.sentiment}\n"
                f"- Trend: {ana.trend}\n"
                f"- Strength Score (0 to 1): {ana.strength}\n"
            )
            groups_text_blocks.append(block)

        batched_groups_content = "\n".join(groups_text_blocks)

        prompt = f"""
You are an intelligence analyst analyzing narratives for the following entity:
Entity Name: {analysis_context.entity_name}
Entity Type: {analysis_context.entity_type}
Domain: {analysis_context.domain}

Below are {len(chunk)} distinct, independent claim groups.
Analyze each claim group INDEPENDENTLY.
Generate a separate Narrative, Intelligence summary, and Actionable Recommendation for EACH group.

CRITICAL RULES:
1. Treat each group independently. NEVER combine or merge unrelated groups into one narrative.
2. The 'group_id' in your output must EXACTLY match the 'GROUP ID' provided in the input block.
3. Narrative = specific recurring perspective/idea supported by this group's claims.
4. Intelligence must be strictly grounded in the group's provided analysis (claim count, sentiment, trend). Do not invent facts. Contextualize for the entity.
5. RECOMMENDATION RULES:
   - Propose concrete, actionable steps related to the subject matter (e.g. maintenance, placement prep, academic policy).
   - Specify who should take action and what it aims to solve.
   - FORBIDDEN: Do NOT mention collecting evidence, checking evidence, verifying claims, or monitoring situation.
   - FORBIDDEN: Do NOT include weather-related remarks or meteorological metaphors unless the narrative is literally about weather disruptions.
   - FORBIDDEN: Do NOT repeat the narrative description as the recommendation.
   - If the available claims are too sparse for an actionable operational recommendation, return EXACTLY:
     "Insufficient information for an actionable recommendation."
6. Return exactly one output item per group in the 'results' array.

{batched_groups_content}
"""

        batch_success = False
        parsed_map: Dict[str, BatchedGroupNarrativeItem] = {}

        try:
            from google.genai import types
            config = types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=BatchedNarrativesResponse,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)
            )

            response = generate_with_retry(
                client=client,
                model=GEMINI_NARRATIVE_MODEL,
                contents=prompt,
                config=config,
                run_id=run_id,
                stage_name="Narrative-Gen-Batch",
                items_count=len(chunk)
            )

            parsed_response = BatchedNarrativesResponse.model_validate_json(response.text)
            for res_item in parsed_response.results:
                clean_id = (res_item.group_id or "").strip()
                if clean_id:
                    parsed_map[clean_id] = res_item

            batch_success = True

        except Exception as batch_err:
            logger.warning(
                f"[Batch-Fallback] Batched Gemini call failed for chunk {chunk_idx + 1}/{len(chunks)}: {batch_err}. "
                f"Falling back to individual group processing."
            )
            batch_success = False

        for it in chunk:
            if run_id:
                cancellation_manager.check_cancelled(run_id)

            grp: ClaimGroup = it["group"]
            evi: NarrativeEvidence = it["evidence"]
            ana: NarrativeAnalysis = it["analysis"]

            if batch_success and grp.group_id in parsed_map:
                res = parsed_map[grp.group_id]
                if res.narrative and res.narrative.strip():
                    narrative_id = f"NAR_{uuid.uuid4().hex[:8]}"
                    rec_clean = _clean_recommendation(res.recommendation)
                    results.append(FinalNarrative(
                        narrative_id=narrative_id,
                        topic="",
                        topic_id="",
                        narrative=res.narrative.strip(),
                        trend=ana.trend,
                        supporting_evidence=evi,
                        analysis=ana,
                        intelligence=res.intelligence.strip() if res.intelligence else "No intelligence generated.",
                        recommendation=rec_clean,
                        is_new_topic=False,
                        display_status=ana.display_status,
                        is_eligible=ana.is_eligible,
                        eligibility_reason=ana.eligibility_reason,
                        direction=ana.direction,
                        priority=ana.priority,
                        positive_significance=ana.positive_significance,
                        classification_reason=ana.classification_reason,
                        impact_indicators=ana.impact_indicators
                    ))
                    continue

            # Fallback for this specific group
            logger.info(f"[Fallback-Individual] Processing group {grp.group_id} individually.")
            narrative = generate_new_narrative(
                group=grp,
                evidence=evi,
                analysis=ana,
                analysis_context=analysis_context,
                run_id=run_id
            )
            results.append(narrative)

    return results


# ============================================================
# MATCHED NARRATIVE UPDATE (SINGLE & BATCHED)
# ============================================================

def _compute_merged_narrative_stats(
    existing: ExistingNarrative,
    new_group_claims: List[EnrichedClaim],
    new_evidence: NarrativeEvidence,
    new_analysis: NarrativeAnalysis
) -> Tuple[NarrativeEvidence, NarrativeAnalysis]:
    """
    Deterministically computes merged evidence, analysis metrics, historical timeline,
    and recalculates genuine trend across combined historical observations.
    """
    combined_claim_count = existing.claim_count + new_analysis.claim_count
    combined_sources = list(set(existing.sources + new_evidence.sources))
    combined_source_count = len(combined_sources)

    if combined_claim_count > 0:
        total_sentiment = (existing.sentiment * existing.claim_count) + (new_analysis.sentiment * new_analysis.claim_count)
        combined_sentiment = total_sentiment / combined_claim_count
    else:
        combined_sentiment = 0.0

    combined_claim_ids = list(set(existing.claim_ids + new_evidence.claim_ids))
    combined_document_ids = list(set(existing.document_ids + new_evidence.document_ids))

    vol_score = min(math.log10(combined_claim_count + 1) / 2.0, 1.0)
    div_score = min(combined_source_count / 5.0, 1.0)
    qual_score = abs(combined_sentiment)
    combined_strength = (0.50 * vol_score) + (0.30 * div_score) + (0.20 * qual_score)
    combined_strength = max(0.0, min(combined_strength, 1.0))

    # Merge historical timeline from existing narrative with new claims
    existing_temporal = getattr(existing, "temporal_information", {}) or {}
    existing_timeline = existing_temporal.get("timeline") or getattr(existing, "timeline", []) or []

    combined_trend, combined_temporal_info, combined_timeline = analyze_narrative_trend(
        claims=new_group_claims,
        existing_timeline=existing_timeline
    )

    # Incorporate existing narrative context alongside new claims so historical high/critical signals are preserved
    context_claims = list(new_group_claims)
    if existing.text and existing.text.strip():
        hist_sent_label = (
            "negative" if existing.sentiment <= -0.05
            else ("positive" if existing.sentiment >= 0.05 else "neutral")
        )
        context_claims.insert(0, EnrichedClaim(
            claim_id=f"{existing.narrative_id}_CTX",
            document_id="existing_context",
            text=existing.text.strip(),
            sentiment=hist_sent_label,
            sentiment_confidence=round(abs(existing.sentiment), 4),
            embedding=[],
            source_metadata={}
        ))

    direction, priority, pos_sig, class_reason, indicators = classify_narrative_context(
        claims=context_claims,
        avg_sentiment=combined_sentiment,
        sources=combined_sources,
        trend=combined_trend,
        total_claim_count=combined_claim_count
    )

    # Re-evaluate display eligibility (preserving elevated severity visibility for critical/high priorities)
    merged_severity = priority if priority in ("critical", "high") else "normal"
    display_status, is_eligible, eligibility_reason = evaluate_display_eligibility(
        claim_count=combined_claim_count,
        source_count=combined_source_count,
        strength=combined_strength,
        severity_level=merged_severity
    )

    merged_evidence = NarrativeEvidence(
        claim_ids=combined_claim_ids,
        document_ids=combined_document_ids,
        sources=combined_sources
    )

    merged_analysis = NarrativeAnalysis(
        claim_count=combined_claim_count,
        source_count=combined_source_count,
        sentiment=round(combined_sentiment, 4),
        temporal_information=combined_temporal_info,
        recurrence=combined_trend,
        trend=combined_trend,
        timeline=combined_timeline,
        strength=round(combined_strength, 4),
        display_status=display_status,
        is_eligible=is_eligible,
        eligibility_reason=eligibility_reason,
        direction=direction,
        priority=priority,
        positive_significance=pos_sig,
        classification_reason=class_reason,
        impact_indicators=indicators
    )

    return merged_evidence, merged_analysis


def update_matched_narrative(
    existing: ExistingNarrative, 
    new_group_claims: List[EnrichedClaim],
    new_evidence: NarrativeEvidence,
    new_analysis: NarrativeAnalysis,
    analysis_context: EntityContext,
    run_id: Optional[str] = None
) -> FinalNarrative:
    """
    Updates intelligence and recommendation for a single matched existing narrative using Gemini.
    """
    client = get_gemini_client()
    merged_evidence, merged_analysis = _compute_merged_narrative_stats(
        existing, new_group_claims, new_evidence, new_analysis
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
2. Ground your intelligence strictly in the updated analysis (total claims: {merged_analysis.claim_count}, sources: {merged_analysis.source_count}, trend: {merged_analysis.trend}). Do not invent facts.
3. RECOMMENDATION RULES:
   - Propose concrete, actionable steps directly addressing the subject of this narrative.
   - Explain what action could be taken, who could take it, and what it aims to improve.
   - FORBIDDEN: Do NOT write generic statements about collecting evidence, checking evidence, verifying claims, or monitoring.
   - FORBIDDEN: Do NOT include weather-related remarks or atmospheric metaphors unless literally about weather disruptions.
   - If the combined information is insufficient to formulate an actionable step, return EXACTLY:
     "Insufficient information for an actionable recommendation."
4. Output only the updated intelligence and recommendation.

Data:
Topic: {existing.topic}
Narrative: {existing.text}
Updated Claim Count: {merged_analysis.claim_count} (was {existing.claim_count})
Updated Source Count: {merged_analysis.source_count} (was {existing.source_count})
Updated Sentiment (avg, -1 to 1): {merged_analysis.sentiment}
Current Trend: {merged_analysis.trend}
Updated Strength Score (0 to 1): {merged_analysis.strength}

New Incoming Claims That Triggered This Update:
{[c.text for c in new_group_claims]}
"""

    try:
        from google.genai import types
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=GeminiUpdatedNarrativeResult,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)
        )
        response = generate_with_retry(
            client=client,
            model=GEMINI_NARRATIVE_MODEL,
            contents=prompt,
            config=config,
            run_id=run_id,
            stage_name="Narrative-Update-Individual",
            items_count=1
        )

        result = GeminiUpdatedNarrativeResult.model_validate_json(response.text)
        rec_clean = _clean_recommendation(result.recommendation)

        return FinalNarrative(
            narrative_id=existing.narrative_id,
            topic=existing.topic,
            narrative=existing.text,
            trend=merged_analysis.trend,
            supporting_evidence=merged_evidence,
            analysis=merged_analysis,
            intelligence=result.intelligence.strip(),
            recommendation=rec_clean,
            display_status=merged_analysis.display_status,
            is_eligible=merged_analysis.is_eligible,
            eligibility_reason=merged_analysis.eligibility_reason,
            direction=merged_analysis.direction,
            priority=merged_analysis.priority,
            positive_significance=merged_analysis.positive_significance,
            classification_reason=merged_analysis.classification_reason,
            impact_indicators=merged_analysis.impact_indicators
        )

    except Exception as e:
        raise RuntimeError(f"Gemini matched narrative update failed for {existing.narrative_id}: {e}")


def update_matched_narratives_batched(
    matched_items: List[Dict[str, Any]],
    analysis_context: EntityContext,
    batch_size: Optional[int] = None,
    run_id: Optional[str] = None
) -> List[FinalNarrative]:
    """
    Batches multiple matched narrative updates into fewer Gemini calls.
    Maintains exact narrative_id mapping, merges historical timelines, and falls back gracefully.
    """
    if not matched_items:
        return []

    if len(matched_items) == 1:
        it = matched_items[0]
        narrative = update_matched_narrative(
            existing=it["existing"],
            new_group_claims=it["new_group_claims"],
            new_evidence=it["new_evidence"],
            new_analysis=it["new_analysis"],
            analysis_context=analysis_context,
            run_id=run_id
        )
        return [narrative]

    if batch_size is None:
        batch_size = int(os.getenv("GEMINI_MAX_BATCH_SIZE", str(DEFAULT_BATCH_SIZE)))

    results: List[FinalNarrative] = []
    client = get_gemini_client()

    chunks = [matched_items[i:i + batch_size] for i in range(0, len(matched_items), batch_size)]

    for chunk in chunks:
        if run_id:
            cancellation_manager.check_cancelled(run_id)

        blocks = []
        merged_cache: Dict[str, Tuple[NarrativeEvidence, NarrativeAnalysis]] = {}

        for it in chunk:
            ex: ExistingNarrative = it["existing"]
            m_evi, m_ana = _compute_merged_narrative_stats(
                ex, it["new_group_claims"], it["new_evidence"], it["new_analysis"]
            )
            merged_cache[ex.narrative_id] = (m_evi, m_ana)

            block = (
                f"--- NARRATIVE ID: {ex.narrative_id} ---\n"
                f"Topic: {ex.topic}\n"
                f"Narrative: {ex.text}\n"
                f"Updated Claim Count: {m_ana.claim_count} (was {ex.claim_count})\n"
                f"Updated Source Count: {m_ana.source_count} (was {ex.source_count})\n"
                f"Updated Sentiment: {m_ana.sentiment}\n"
                f"Current Trend: {m_ana.trend}\n"
                f"Updated Strength Score: {m_ana.strength}\n"
                f"New Incoming Claims:\n"
                f"{[c.text for c in it['new_group_claims']]}\n"
            )
            blocks.append(block)

        batched_text = "\n".join(blocks)
        prompt = f"""
You are an intelligence analyst analyzing narratives for the following entity:
Entity Name: {analysis_context.entity_name}
Entity Type: {analysis_context.entity_type}
Domain: {analysis_context.domain}

The following existing narratives have received NEW supporting evidence.
Update the Intelligence and Recommendation for EACH narrative independently based on its updated statistics.

CRITICAL RULES:
1. Treat each narrative independently.
2. The 'narrative_id' in your output must EXACTLY match the 'NARRATIVE ID' provided in each block.
3. Ground intelligence strictly in the updated analysis. Do not invent facts.
4. RECOMMENDATION RULES:
   - Propose actionable, concrete operational/policy steps for the entity.
   - FORBIDDEN: Do NOT mention evidence, checking evidence, verifying claims, or monitoring.
   - FORBIDDEN: Do NOT mention weather or meteorological metaphors unless literally about weather.
   - If evidence is insufficient for an actionable recommendation, return EXACTLY:
     "Insufficient information for an actionable recommendation."
5. Return exactly one output item per narrative in the 'results' list.

{batched_text}
"""

        batch_success = False
        parsed_map: Dict[str, BatchedMatchedUpdateItem] = {}

        try:
            from google.genai import types
            config = types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=BatchedMatchedUpdatesResponse,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)
            )

            response = generate_with_retry(
                client=client,
                model=GEMINI_NARRATIVE_MODEL,
                contents=prompt,
                config=config,
                run_id=run_id,
                stage_name="Narrative-Update-Batch",
                items_count=len(chunk)
            )

            parsed = BatchedMatchedUpdatesResponse.model_validate_json(response.text)
            for res_item in parsed.results:
                clean_id = (res_item.narrative_id or "").strip()
                if clean_id:
                    parsed_map[clean_id] = res_item

            batch_success = True

        except Exception as e:
            logger.warning(f"[Batch-Update-Fallback] Batched Gemini update failed: {e}. Falling back to individual.")
            batch_success = False

        for it in chunk:
            if run_id:
                cancellation_manager.check_cancelled(run_id)

            ex: ExistingNarrative = it["existing"]
            m_evi, m_ana = merged_cache[ex.narrative_id]

            if batch_success and ex.narrative_id in parsed_map:
                res = parsed_map[ex.narrative_id]
                rec_clean = _clean_recommendation(res.recommendation)
                results.append(FinalNarrative(
                    narrative_id=ex.narrative_id,
                    topic=ex.topic,
                    narrative=ex.text,
                    trend=m_ana.trend,
                    supporting_evidence=m_evi,
                    analysis=m_ana,
                    intelligence=res.intelligence.strip() if res.intelligence else "Updated intelligence.",
                    recommendation=rec_clean,
                    display_status=m_ana.display_status,
                    is_eligible=m_ana.is_eligible,
                    eligibility_reason=m_ana.eligibility_reason,
                    direction=m_ana.direction,
                    priority=m_ana.priority,
                    positive_significance=m_ana.positive_significance,
                    classification_reason=m_ana.classification_reason,
                    impact_indicators=m_ana.impact_indicators
                ))
            else:
                updated = update_matched_narrative(
                    existing=ex,
                    new_group_claims=it["new_group_claims"],
                    new_evidence=it["new_evidence"],
                    new_analysis=it["new_analysis"],
                    analysis_context=analysis_context,
                    run_id=run_id
                )
                results.append(updated)

    return results
