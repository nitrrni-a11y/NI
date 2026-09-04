import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.embeddings.generator import generate_embedding

def run_example():
    claim_id = "CLM_001"
    claim_text = "NIT Raipur improved its placement performance."
    
    print("====================================")
    print("INPUT:")
    print("====================================")
    print(f"Claim ID:   {claim_id}")
    print(f"Claim Text: {claim_text}")
    
    output = generate_embedding(claim_id, claim_text)
    
    print("\n====================================")
    print("OUTPUT SUMMARY:")
    print("====================================")
    print(f"Claim ID:  {output['claim_id']}")
    print(f"Model Dim: {output['dimension']}")
    print(f"Vector (first 5 values): {output['embedding'][:5]}")

if __name__ == "__main__":
    run_example()
