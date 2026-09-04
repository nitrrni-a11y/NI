import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.grouping.grouper import group_claims

# We mock embeddings for the example to keep it independent of the embeddings model running
# For a real pipeline, these embeddings come from generate_embedding()
def run_example():
    # Example claims with dummy 3D embeddings for demonstration
    # In reality, these are 384D vectors
    claims = [
        {
            "claim_id": "CLM_001",
            "text": "NIT Raipur placement statistics improved.",
            "embedding": [0.9, 0.1, 0.0]
        },
        {
            "claim_id": "CLM_002",
            "text": "Placement performance at NITRR increased.",
            "embedding": [0.88, 0.12, 0.0]
        },
        {
            "claim_id": "CLM_003",
            "text": "The college introduced a new sports facility.",
            "embedding": [0.0, 0.9, 0.1]
        }
    ]
    
    print("====================================")
    print("INPUT CLAIMS (with dummy embeddings):")
    print("====================================")
    for c in claims:
        print(f"[{c['claim_id']}] {c['text']}")
        
    # Using a small threshold since dummy embeddings are very similar
    output = group_claims(claims, distance_threshold=0.1)
    
    print("\n====================================")
    print("OUTPUT (Structured JSON):")
    print("====================================")
    import json
    print(json.dumps(output, indent=2))

if __name__ == "__main__":
    run_example()
