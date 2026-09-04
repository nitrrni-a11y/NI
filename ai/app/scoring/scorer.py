import math
from typing import Dict, Any

# ============================================================
# NARRATIVE SCORING
# ============================================================
#
# Purpose:
# Computes a confidence/strength score for a narrative based on
# the amount and quality of supporting evidence.
#
# Input:
# Dict containing narrative details:
# - narrative_id
# - claim_count
# - unique_sources
# - average_confidence (of claims)
#
# Output:
# Dict with the narrative_id, the final normalized score (0.0 - 1.0),
# and the component breakdown.
#
# Why:
# We need to rank narratives by importance.
# A narrative supported by many claims from multiple sources with
# high-confidence evidence should receive a higher score.
#
# Implementation:
# Uses a deterministic, weighted scoring formula:
#
# - Volume Component:
#   Measures how much evidence supports the narrative.
#
# - Diversity Component:
#   Measures how many different sources support the narrative.
#
# - Quality Component:
#   Uses the average confidence of the supporting claims.
#
# Final Score:
#   (50% Volume) + (30% Diversity) + (20% Quality)
#
# The final score is always bounded between 0.0 and 1.0.
#
# ============================================================


def score_narrative(narrative_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculates the strength score of a narrative based on its metrics.

    Args:
        narrative_data (Dict): Metrics about the narrative.

    Returns:
        Dict: Structured score result.
    """

    if not narrative_data:
        return {}

    narrative_id = narrative_data.get("narrative_id", "UNKNOWN")

    claim_count = max(
        0,
        narrative_data.get("claim_count", 0)
    )

    unique_sources = max(
        0,
        narrative_data.get("unique_sources", 0)
    )

    avg_conf = max(
        0.0,
        min(
            1.0,
            narrative_data.get("average_confidence", 0.0)
        )
    )

    # ========================================================
    # 1. VOLUME SCORE
    # ========================================================
    #
    # More supporting claims → stronger evidence.
    # Logarithmic scaling prevents very large claim counts
    # from dominating the entire score.
    #
    # 100 claims ≈ 1.0
    #
    vol_score = min(
        math.log10(claim_count + 1) / 2.0,
        1.0
    )

    # ========================================================
    # 2. DIVERSITY SCORE
    # ========================================================
    #
    # More independent sources → stronger evidence.
    #
    # 5 or more sources → 1.0
    #
    div_score = min(
        unique_sources / 5.0,
        1.0
    )

    # ========================================================
    # 3. QUALITY SCORE
    # ========================================================
    #
    # Uses the average confidence of the supporting claims.
    #
    qual_score = avg_conf

    # ========================================================
    # WEIGHTS
    # ========================================================

    w_vol = 0.50
    w_div = 0.30
    w_qual = 0.20

    # ========================================================
    # FINAL SCORE
    # ========================================================

    final_score = (
        (w_vol * vol_score)
        + (w_div * div_score)
        + (w_qual * qual_score)
    )

    final_score = max(
        0.0,
        min(final_score, 1.0)
    )

    # ========================================================
    # OUTPUT
    # ========================================================

    return {
        "narrative_id": narrative_id,
        "score": round(final_score, 4),
        "components": {
            "volume_score": round(vol_score, 4),
            "diversity_score": round(div_score, 4),
            "quality_score": round(qual_score, 4)
        }
    }