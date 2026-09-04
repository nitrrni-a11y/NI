import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.narratives.detector import detect_narrative

def run_example():
    claim_group = {
        "group_id": "GRP_001",
        "claim_ids": ["CLM_01", "CLM_02", "CLM_03"],
        "claim_texts": [
            "NIT Raipur placement statistics improved.",
            "Placement performance at NITRR increased.",
            "Many students at NIT Raipur got better jobs this year."
        ]
    }
    
    print("====================================")
    print("INPUT CLAIM GROUP:")
    print("====================================")
    import json
    print(json.dumps(claim_group, indent=2))
    
    output = detect_narrative(claim_group)
    
    print("\n====================================")
    print("OUTPUT (Structured JSON):")
    print("====================================")
    print(json.dumps(output, indent=2))
    
    if "[Generated without LLM]" in output.get("narrative", ""):
        print("\nNote: LLM API key not found or failed. Used deterministic fallback.")

if __name__ == "__main__":
    run_example()
