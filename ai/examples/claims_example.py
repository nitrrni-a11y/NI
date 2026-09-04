import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.claims.extractor import extract_claims

def run_example():
    input_text = """
    NIT Raipur introduced a new AI laboratory.
    The laboratory will support student research.
    It will also collaborate with industry.
    """
    
    print("====================================")
    print("INPUT:")
    print("====================================")
    print(input_text.strip())
    
    output = extract_claims(input_text)
    
    print("\n====================================")
    print("OUTPUT (Structured JSON):")
    print("====================================")
    import json
    print(json.dumps(output, indent=2))

if __name__ == "__main__":
    run_example()
