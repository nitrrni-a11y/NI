import sys
import os

# Add the 'ai' directory to python path so 'app' can be imported easily
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.cleaning.cleaner import clean_text

def run_example():
    input_text = """
    NIT Raipur   has announced a new initiative!!!
    
    <p>Visit https://example.com for more information.</p>
    
    
    
    The date is 2026-09-02 &amp; attendance is 100%.
    """
    
    print("====================================")
    print("INPUT:")
    print("====================================")
    print(input_text)
    
    output = clean_text(input_text)
    
    print("\n====================================")
    print("OUTPUT (Structured JSON):")
    print("====================================")
    import json
    print(json.dumps(output, indent=2))

if __name__ == "__main__":
    run_example()
