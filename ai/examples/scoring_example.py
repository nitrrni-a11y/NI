import sys
import os
import json

sys.path.append(
    os.path.dirname(
        os.path.dirname(
            os.path.abspath(__file__)
        )
    )
)

from app.scoring.scorer import score_narrative


# ============================================================
# SCORING EXAMPLE
# ============================================================
#
# Purpose:
# Demonstrates how narrative strength is calculated using
# claim volume, source diversity, and claim confidence.
#
# ============================================================


def run_example():

    narratives = [
        {
            "narrative_id": "NAR_001",
            "description": "High volume, high diversity, high confidence",
            "claim_count": 150,
            "unique_sources": 8,
            "average_confidence": 0.95
        },
        {
            "narrative_id": "NAR_002",
            "description": "Low volume, single source, low confidence",
            "claim_count": 2,
            "unique_sources": 1,
            "average_confidence": 0.40
        }
    ]

    for nar in narratives:

        print("====================================")
        print("INPUT NARRATIVE METRICS:")
        print("====================================")

        print(json.dumps(nar, indent=2))

        output = score_narrative(nar)

        print("\nOUTPUT (Structured JSON):")
        print(json.dumps(output, indent=2))

        print("\n")


if __name__ == "__main__":
    run_example()