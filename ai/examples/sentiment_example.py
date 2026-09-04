import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.sentiment.analyzer import analyze_sentiment

def run_example():
    claims = [
        {
            "claim_id": "CLM_001",
            "text": "NIT Raipur successfully improved its placement performance."
        },
        {
            "claim_id": "CLM_002",
            "text": "The new attendance policy is a terrible mistake and students are angry."
        },
        {
            "claim_id": "CLM_003",
            "text": "The library is located in the main building."
        }
    ]
    
    for claim in claims:
        print("====================================")
        print("INPUT CLAIM:")
        print("====================================")
        print(f"[{claim['claim_id']}] {claim['text']}")
        
        output = analyze_sentiment(claim)
        
        print("\nOUTPUT:")
        import json
        print(json.dumps(output, indent=2))
        print("\n")

if __name__ == "__main__":
    run_example()
