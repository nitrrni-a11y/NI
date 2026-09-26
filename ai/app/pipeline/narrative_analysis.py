import math
import numpy as np
from datetime import datetime
from typing import List, Dict, Any, Tuple

from app.pipeline.schemas import Narrative, EnrichedClaim, NarrativeAnalysis, NarrativeEvidence

def analyze_cross_source(claims: List[EnrichedClaim]) -> List[str]:
    source_counts = {}
    for claim in claims:
        source = claim.source_metadata.get("source", "Unknown")
        source_normalized = str(source).strip().title()
        source_counts[source_normalized] = True
    return list(source_counts.keys())

def analyze_narrative_trend(claims: List[EnrichedClaim]) -> Tuple[str, Dict[str, Any]]:
    parsed_obs = []
    for claim in claims:
        date_str = claim.source_metadata.get("published_at")
        if date_str:
            try:
                dt = datetime.strptime(date_str, "%Y-%m-%d")
                parsed_obs.append(dt)
            except ValueError:
                continue

    if len(parsed_obs) < 2:
        return "stable", {"data": "insufficient"}

    date_counts = {}
    for dt in parsed_obs:
        if dt not in date_counts:
            date_counts[dt] = 0
        date_counts[dt] += 1

    sorted_dates = sorted(date_counts.keys())
    start_date = sorted_dates[0]

    x_days = np.array([(dt - start_date).days for dt in sorted_dates])
    y_counts = np.array([date_counts[dt] for dt in sorted_dates])

    if len(x_days) < 2 or x_days[-1] == 0:
        return "stable", {"start_date": str(start_date.date()), "end_date": str(sorted_dates[-1].date()), "days_span": 0}

    m, c = np.polyfit(x_days, y_counts, 1)

    epsilon = 0.1
    if m > epsilon:
        trend = "increasing"
    elif m < -epsilon:
        trend = "decreasing"
    else:
        trend = "stable"
        
    return trend, {
        "start_date": str(start_date.date()),
        "end_date": str(sorted_dates[-1].date()),
        "days_span": int(x_days[-1])
    }

def score_narrative(claim_count: int, unique_sources: int, avg_conf: float) -> float:
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

def analyze_narratives(narratives: List[Narrative], all_claims: List[EnrichedClaim]) -> List[Tuple[Narrative, NarrativeEvidence, NarrativeAnalysis]]:
    claim_map = {c.claim_id: c for c in all_claims}
    analyzed = []

    for narrative in narratives:
        supporting_claims = [claim_map[cid] for cid in narrative.claim_ids if cid in claim_map]
        
        sources = analyze_cross_source(supporting_claims)
        trend_str, trend_data = analyze_narrative_trend(supporting_claims)
        
        avg_sentiment = 0.0
        if supporting_claims:
            avg_sentiment = sum(c.sentiment_confidence if c.sentiment == "positive" else (-c.sentiment_confidence if c.sentiment == "negative" else 0.0) for c in supporting_claims) / len(supporting_claims)
            
        strength = score_narrative(
            claim_count=len(supporting_claims),
            unique_sources=len(sources),
            avg_conf=abs(avg_sentiment)
        )
        
        document_ids = list(set([c.document_id for c in supporting_claims]))

        evidence = NarrativeEvidence(
            claim_ids=narrative.claim_ids,
            document_ids=document_ids,
            sources=sources
        )
        
        analysis = NarrativeAnalysis(
            claim_count=len(supporting_claims),
            source_count=len(sources),
            sentiment=round(avg_sentiment, 4),
            temporal_information=trend_data,
            recurrence=trend_str,
            strength=round(strength, 4)
        )

        analyzed.append((narrative, evidence, analysis))

    return analyzed
