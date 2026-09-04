import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.cross_source.analyzer import analyze_cross_source

def run_example():
    narrative_data = {
        "narrative_id": "NAR_001",
        "claims": [
            {"claim_id": "C1", "source": "News"},
            {"claim_id": "C2", "source": "News"},
            {"claim_id": "C3", "source": "Reddit"},
            {"claim_id": "C4", "source": "reddit"}, # should normalize to Reddit
            {"claim_id": "C5", "source": "YouTube"},
            {"claim_id": "C6", "source": "News"},
            {"claim_id": "C7"} # missing source
        ]
    }
    
    print("====================================")
    print("INPUT NARRATIVE DATA:")
    print("====================================")
    import json
    print(json.dumps(narrative_data, indent=2))
    
    output = analyze_cross_source(narrative_data)
    
    print("\n====================================")
    print("OUTPUT (Structured JSON):")
    print("====================================")
    print(json.dumps(output, indent=2))

if __name__ == "__main__":
    run_example()
