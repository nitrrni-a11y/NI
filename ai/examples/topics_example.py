import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.topics.identifier import identify_topics

def run_example():
    input_text = """
    NIT Raipur students received several placement offers
    from technology companies this year. The placement cell
    worked very hard to bring companies like Microsoft.
    """
    
    print("====================================")
    print("INPUT:")
    print("====================================")
    print(input_text)
    
    output = identify_topics(input_text, top_n=3)
    
    print("\n====================================")
    print("OUTPUT (Structured JSON):")
    print("====================================")
    import json
    print(json.dumps(output, indent=2))

if __name__ == "__main__":
    run_example()
