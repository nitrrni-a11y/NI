import math
import numpy as np
from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional

from app.pipeline.schemas import Narrative, EnrichedClaim, NarrativeAnalysis, NarrativeEvidence

def parse_flexible_date(val: Any) -> Optional[datetime]:
    """
    Robustly parses various date formats into a naive datetime.
    Supports ISO formats, YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, etc.
    """
    if not val:
        return None
    if isinstance(val, datetime):
        return val.replace(tzinfo=None)

    s = str(val).strip()
    if not s or s.lower() in ("none", "null", "unknown", "undefined"):
        return None

    # Handle ISO timestamps with Z or offset
    try:
        clean_s = s.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_s)
        return dt.replace(tzinfo=None)
    except Exception:
        pass

    # Extract date portion before space or T
    date_part = s.split("T")[0].split(" ")[0].strip()

    formats = [
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%d/%m/%Y",
        "%Y/%m/%d",
        "%d-%m-%Y",
        "%m-%d-%Y",
        "%b %d, %Y",
        "%d %b %Y",
        "%B %d, %Y"
    ]
    for fmt in formats:
        try:
            return datetime.strptime(date_part, fmt)
        except Exception:
            continue

    return None

def analyze_cross_source(claims: List[EnrichedClaim]) -> List[str]:
    source_counts = {}
    for claim in claims:
        source = claim.source_metadata.get("source", "Unknown")
        source_normalized = str(source).strip().title()
        source_counts[source_normalized] = True
    return list(source_counts.keys())

def analyze_narrative_trend(
    claims: List[EnrichedClaim],
    existing_timeline: Optional[List[Dict[str, Any]]] = None
) -> Tuple[str, Dict[str, Any], List[Dict[str, Any]]]:
    """
    Evaluates evidence volume and recurrence over time using actual timestamps.
    Returns: (trend_classification, temporal_info_dict, timeline_list)

    Valid trend classifications:
    - 'Rising': Supporting evidence velocity/volume is increasing over time.
    - 'Declining': Supporting evidence velocity/volume is decreasing over time.
    - 'Stable': Sufficient historical evidence exists, but volume is steady without major change.
    - 'Insufficient Data': Not enough temporal data points or time span to determine a trend.
    """
    # 1. Collect date observations and sentiments
    # Use existing timeline if merging historical records
    timeline_map: Dict[str, Dict[str, Any]] = {}
    if existing_timeline:
        for pt in existing_timeline:
            d_str = pt.get("date")
            if d_str:
                timeline_map[d_str] = {
                    "claim_count": pt.get("claim_count", 0),
                    "sentiment_sum": pt.get("avg_sentiment", 0.0) * pt.get("claim_count", 1),
                    "sources": set(pt.get("sources", []))
                }

    for claim in claims:
        if isinstance(claim, dict):
            meta = claim.get("source_metadata") or claim.get("metadata") or {}
            dt = (
                parse_flexible_date(meta.get("published_at")) or
                parse_flexible_date(meta.get("collected_at")) or
                parse_flexible_date(claim.get("published_at")) or
                parse_flexible_date(claim.get("date")) or
                parse_flexible_date(claim.get("created_at"))
            )
            sentiment = claim.get("sentiment")
            sentiment_confidence = float(claim.get("sentiment_confidence", 0.8) or 0.8)
            src = meta.get("source") or meta.get("platform") or claim.get("source")
        else:
            meta = getattr(claim, "source_metadata", {}) or {}
            dt = (
                parse_flexible_date(meta.get("published_at")) or
                parse_flexible_date(meta.get("collected_at"))
            )
            sentiment = getattr(claim, "sentiment", None)
            sentiment_confidence = float(getattr(claim, "sentiment_confidence", 0.8) or 0.8)
            src = meta.get("source")

        if not dt:
            continue

        date_key = dt.strftime("%Y-%m-%d")
        if date_key not in timeline_map:
            timeline_map[date_key] = {
                "claim_count": 0,
                "sentiment_sum": 0.0,
                "sources": set()
            }

        sent_val = 0.0
        if sentiment == "positive":
            sent_val = sentiment_confidence
        elif sentiment == "negative":
            sent_val = -sentiment_confidence

        timeline_map[date_key]["claim_count"] += 1
        timeline_map[date_key]["sentiment_sum"] += sent_val
        if src:
            timeline_map[date_key]["sources"].add(str(src).strip().title())

    if not timeline_map:
        return "Insufficient Data", {"data": "no_dates", "timeline": []}, []

    sorted_dates = sorted(timeline_map.keys())
    timeline: List[Dict[str, Any]] = []
    for d_str in sorted_dates:
        entry = timeline_map[d_str]
        c_count = entry["claim_count"]
        avg_sent = round(entry["sentiment_sum"] / c_count, 4) if c_count > 0 else 0.0
        timeline.append({
            "date": d_str,
            "claim_count": c_count,
            "avg_sentiment": avg_sent,
            "sources": sorted(list(entry["sources"]))
        })

    total_claims = sum(pt["claim_count"] for pt in timeline)
    start_dt = datetime.strptime(sorted_dates[0], "%Y-%m-%d")
    end_dt = datetime.strptime(sorted_dates[-1], "%Y-%m-%d")
    days_span = (end_dt - start_dt).days

    temporal_info = {
        "start_date": sorted_dates[0],
        "end_date": sorted_dates[-1],
        "days_span": days_span,
        "data_points": len(sorted_dates),
        "total_timestamped_claims": total_claims,
        "timeline": timeline
    }

    # Minimum data requirement:
    # Needs at least 3 total claims across at least 2 distinct dates/time points.
    if len(sorted_dates) < 2 or total_claims < 3 or days_span == 0:
        return "Insufficient Data", temporal_info, timeline

    # Calculate trend from timeline points
    # Compare early half volume vs recent half volume, plus linear fit slope
    counts = [pt["claim_count"] for pt in timeline]
    mid = len(counts) // 2
    early_volume = sum(counts[:mid]) if mid > 0 else counts[0]
    recent_volume = sum(counts[mid:]) if mid > 0 else counts[-1]

    early_rate = early_volume / max(1, mid)
    recent_rate = recent_volume / max(1, len(counts) - mid)

    # Normalized linear regression slope
    x_days = np.array([(datetime.strptime(d, "%Y-%m-%d") - start_dt).days for d in sorted_dates])
    y_counts = np.array(counts)

    m, c = np.polyfit(x_days, y_counts, 1)
    mean_y = max(0.5, float(np.mean(y_counts)))
    normalized_slope = (m * max(1, days_span)) / mean_y

    rate_change_ratio = (recent_rate - early_rate) / max(0.5, early_rate)

    # Trend determination
    if (normalized_slope > 0.25 and rate_change_ratio > 0.15) or rate_change_ratio > 0.35:
        trend = "Rising"
    elif (normalized_slope < -0.25 and rate_change_ratio < -0.15) or rate_change_ratio < -0.35:
        trend = "Declining"
    else:
        trend = "Stable"

    temporal_info["relative_slope"] = round(float(normalized_slope), 4)
    temporal_info["rate_change_ratio"] = round(float(rate_change_ratio), 4)

    return trend, temporal_info, timeline

def evaluate_display_eligibility(
    claim_count: int, 
    source_count: int, 
    strength: float, 
    severity_level: str = "normal"
) -> Tuple[str, bool, str]:
    """
    Evaluates whether a narrative meets the minimum evidence threshold for main dashboard visibility.
    Weak/single-claim narratives are kept internally as 'candidate' observations for identity matching.

    Rules:
    - Multiple independent sources (source_count >= 2) -> Established
    - Multiple supporting claims with moderate strength (claim_count >= 2 and strength >= 0.35) -> Established
    - High/critical severity -> Established (safety critical)
    - Otherwise (e.g. 1 claim, single source) -> Candidate (retained internally, hidden from main view)
    """
    if severity_level is True or str(severity_level).lower() in ("high", "critical", "true"):
        return "established", True, "Elevated severity level requires visibility"

    if source_count >= 2:
        return "established", True, "Corroborated across multiple independent sources"

    if claim_count >= 2 and strength >= 0.35:
        return "established", True, "Supported by multiple independent claims with adequate evidence strength"

    return "candidate", False, "Single claim from single source - retained as candidate observation awaiting corroborating evidence"

def score_narrative(claim_count: int, unique_sources: int, avg_conf: float) -> float:
    """
    Preserved narrative strength scoring formula.
    """
    claim_count = max(0, claim_count)
    unique_sources = max(0, unique_sources)
    avg_conf = max(0.0, min(1.0, avg_conf))

    vol_score = min(math.log10(claim_count + 1) / 2.0, 1.0)
    div_score = min(unique_sources / 5.0, 1.0)
    qual_score = avg_conf

    w_vol = 0.50
    w_div = 0.30
    w_qual = 0.20

    final_score = (w_vol * vol_score) + (w_div * div_score) + (w_qual * qual_score)
    return max(0.0, min(final_score, 1.0))

def classify_narrative_context(
    claims: List[EnrichedClaim],
    avg_sentiment: float,
    sources: List[str],
    trend: str = "Stable",
    total_claim_count: Optional[int] = None
) -> Tuple[str, str, str, str, List[str]]:
    """
    Context-aware narrative classification:
    Returns (direction, priority, positive_significance, classification_reason, impact_indicators).
    
    Directions: 'negative', 'positive', 'neutral', 'mixed'
    Negative Priorities: 'critical', 'high', 'medium', 'low', 'none'
    Positive Significances: 'significant', 'notable', 'general', 'none'
    """
    all_texts = " ".join([c.text.lower() for c in claims if hasattr(c, 'text') and c.text])
    claim_count = total_claim_count if total_claim_count is not None else len(claims)
    source_count = len(sources)
    
    pos_count = sum(1 for c in claims if getattr(c, 'sentiment', '') == 'positive')
    neg_count = sum(1 for c in claims if getattr(c, 'sentiment', '') == 'negative')
    neu_count = sum(1 for c in claims if getattr(c, 'sentiment', '') in ('neutral', ''))

    # 1. Determine Direction
    direction = "neutral"
    if pos_count > 0 and neg_count > 0 and (min(pos_count, neg_count) / max(pos_count, neg_count)) >= 0.35:
        direction = "mixed"
    elif avg_sentiment <= -0.15 or (neg_count > pos_count and neg_count >= 1):
        direction = "negative"
    elif avg_sentiment >= 0.15 or (pos_count > neg_count and pos_count >= 1):
        direction = "positive"
    else:
        direction = "neutral"

    # Indicators collector
    indicators: List[str] = []
    priority = "none"
    positive_sig = "none"
    reason = ""

    # Check for safety / threat keywords
    is_prevention = any(w in all_texts for w in [
        "prevention", "workshop", "awareness", "anti-ragging", "counseling", "drill", "hypothetical", "training"
    ])
    has_self_harm = any(w in all_texts for w in ["suicide", "suicidal", "self-harm", "took own life", "died by suicide"])
    has_violence = any(w in all_texts for w in ["active shooter", "bomb threat", "stabbing", "mass casualty", "terrorist attack"])

    has_placement = any(w in all_texts for w in ["placement", "package", "lpa", "ctc", "recruiter", "hiring", "unplaced", "internship"])
    has_infrastructure = any(w in all_texts for w in ["hostel", "water", "mess", "food poisoning", "electricity", "washroom", "facility"])
    has_academic = any(w in all_texts for w in ["faculty", "professors", "curriculum", "exam", "syllabus", "accreditation", "grading"])
    has_achievements = any(w in all_texts for w in ["rank", "nirf", "hackathon", "winner", "record", "award", "patent", "grant"])

    if has_placement: indicators.append("placement_impact")
    if has_infrastructure: indicators.append("infrastructure")
    if has_academic: indicators.append("academic")
    if has_achievements: indicators.append("achievement")
    if claim_count >= 3 or source_count >= 2: indicators.append("recurring")

    if direction == "negative":
        # Check Critical
        if (has_self_harm or has_violence) and not is_prevention:
            priority = "critical"
            indicators.append("safety_critical")
            reason = "Urgent safety or security concern requiring immediate executive attention."
        elif has_placement and any(w in all_texts for w in ["unplaced", "scam", "blacklisted", "boycott", "fraud", "zero offers"]):
            priority = "high"
            indicators.append("campus_wide")
            reason = "Major placement crisis or systemic recruitment shortcoming affecting graduating students."
        elif has_infrastructure and any(w in all_texts for w in ["contamination", "poisoning", "no water", "uninhabitable", "severe", "outbreak"]):
            priority = "high"
            indicators.append("campus_wide")
            reason = "Severe living condition or health-impacting facility deficiency."
        elif (claim_count >= 4 or (claim_count >= 2 and source_count >= 2)) and avg_sentiment <= -0.5:
            priority = "high"
            indicators.append("campus_wide")
            reason = "Persistent recurring grievance corroborated across multiple sources or high claim density."
        elif (has_infrastructure or has_academic) and (claim_count >= 2 or any(w in all_texts for w in ["broken", "faulty", "shortage", "unhygienic", "leakage", "curfew", "strict", "poor quality", "bad food"])):
            priority = "medium"
            reason = "Meaningful institutional concern requiring operational or administrative resolution."
        elif claim_count >= 2 or trend == "Rising":
            priority = "medium"
            reason = "Recurring institutional feedback requiring administrative monitoring."
        else:
            priority = "low"
            indicators.append("routine_feedback")
            reason = "Routine student feedback or isolated minor inconvenience."

    elif direction == "positive":
        # Check Positive Significance
        if has_achievements or (has_placement and any(w in all_texts for w in ["100%", "highest", "record", "international", "crore", "top tier"])):
            positive_sig = "significant"
            indicators.append("record_achievement")
            reason = "Major institutional milestone, standout placement outcome, or prestigious achievement."
        elif (claim_count >= 2 and source_count >= 2) or has_placement or has_academic or any(w in all_texts for w in ["excellent", "outstanding", "great support", "well organized"]):
            positive_sig = "notable"
            reason = "Notable highlight reflecting consistent institutional strengths or successful programs."
        else:
            positive_sig = "general"
            indicators.append("routine_feedback")
            reason = "General positive student sentiment and routine positive feedback."

    else:
        # Neutral or mixed
        reason = "Balanced multi-faceted observation or factual institutional narrative."

    return direction, priority, positive_sig, reason, indicators

def analyze_claim_group(
    supporting_claims: List[EnrichedClaim],
    existing_timeline: Optional[List[Dict[str, Any]]] = None
) -> Tuple[NarrativeEvidence, NarrativeAnalysis]:
    sources = analyze_cross_source(supporting_claims)
    trend_str, trend_data, timeline = analyze_narrative_trend(supporting_claims, existing_timeline)
    
    avg_sentiment = 0.0
    if supporting_claims:
        avg_sentiment = sum(
            c.sentiment_confidence if c.sentiment == "positive" else (-c.sentiment_confidence if c.sentiment == "negative" else 0.0)
            for c in supporting_claims
        ) / len(supporting_claims)
        
    strength = score_narrative(
        claim_count=len(supporting_claims),
        unique_sources=len(sources),
        avg_conf=abs(avg_sentiment)
    )

    direction, priority, pos_sig, class_reason, indicators = classify_narrative_context(
        claims=supporting_claims,
        avg_sentiment=avg_sentiment,
        sources=sources,
        trend=trend_str
    )

    display_status, is_eligible, eligibility_reason = evaluate_display_eligibility(
        claim_count=len(supporting_claims),
        source_count=len(sources),
        strength=strength,
        severity_level="critical" if priority == "critical" else "normal"
    )
    
    document_ids = list(set([c.document_id for c in supporting_claims]))
    claim_ids = list(set([c.claim_id for c in supporting_claims]))

    evidence = NarrativeEvidence(
        claim_ids=claim_ids,
        document_ids=document_ids,
        sources=sources
    )
    
    analysis = NarrativeAnalysis(
        claim_count=len(supporting_claims),
        source_count=len(sources),
        sentiment=round(avg_sentiment, 4),
        temporal_information=trend_data,
        recurrence=trend_str,
        trend=trend_str,
        timeline=timeline,
        strength=round(strength, 4),
        display_status=display_status,
        is_eligible=is_eligible,
        eligibility_reason=eligibility_reason,
        direction=direction,
        priority=priority,
        positive_significance=pos_sig,
        classification_reason=class_reason,
        impact_indicators=indicators
    )

    return evidence, analysis
