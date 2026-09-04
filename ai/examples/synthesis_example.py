import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.synthesis.synthesizer import generate_synthesis

def run_example():
    mock_pipeline_data = {
        "narratives": [
            {
                "narrative": "Students are protesting the new attendance policy.",
                "score": 0.95,
                "trend": "increasing",
                "cross_source": True,
                "claims": [
                    {"text": "The new attendance policy is unfair.", "source": "Reddit", "stance": "against"},
                    {"text": "Hundreds of students protested the 75% criteria today.", "source": "News", "stance": "neutral"}
                ]
            }
        ]
    }
    
    print("====================================")
    print("INPUT PIPELINE DATA:")
    print("====================================")
    import json
    print(json.dumps(mock_pipeline_data, indent=2))
    
    output = generate_synthesis(mock_pipeline_data)
    
    print("\n====================================")
    print("OUTPUT (Structured JSON):")
    print("====================================")
    print(json.dumps(output, indent=2))

if __name__ == "__main__":
    run_example()
