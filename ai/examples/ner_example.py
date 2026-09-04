import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ner.extractor import extract_entities

def run_example():
    input_text = "NIT Raipur organized a massive technology event in Raipur on August 28th, attracting Microsoft and Google."
    
    print("====================================")
    print("INPUT:")
    print("====================================")
    print(input_text)
    
    output = extract_entities(input_text)
    
    print("\n====================================")
    print("OUTPUT (Structured JSON):")
    print("====================================")
    import json
    print(json.dumps(output, indent=2))

if __name__ == "__main__":
    run_example()
