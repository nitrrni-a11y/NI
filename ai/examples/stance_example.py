import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.stance.detector import detect_stance

def run_example():
    examples = [
        {
            "claim": "The new attendance policy is completely unreasonable and unfair to students.",
            "target": "attendance policy"
        },
        {
            "claim": "The new attendance policy is completely unreasonable and unfair to students.",
            "target": "student protests"
        },
        {
            "claim": "The library is located in the main building.",
            "target": "attendance policy"
        }
    ]
    
    for ex in examples:
        print("====================================")
        print("INPUT:")
        print("====================================")
        print(f"Claim:  {ex['claim']}")
        print(f"Target: {ex['target']}")
        
        output = detect_stance(ex['claim'], ex['target'])
        
        print("\nOUTPUT:")
        import json
        print(json.dumps(output, indent=2))
        print("\n")

if __name__ == "__main__":
    run_example()
