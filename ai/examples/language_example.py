import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.language.processor import process_language

def run_example():
    examples = [
        ("English", "NIT Raipur launched a new initiative today."),
        ("Hindi", "एनआईटी रायपुर ने नई पहल शुरू की।"),
        ("Telugu", "ఎన్ఐటి రాయ్పూర్ ఒక కొత్త చొరవను ప్రారంభించింది."),
        ("Short/Uncertain", "NITRR"),
    ]
    
    for lang, text in examples:
        print(f"\n====================================")
        print(f"INPUT ({lang}):")
        print(f"====================================")
        print(text)
        
        output = process_language(text)
        
        print(f"\nOUTPUT:")
        import json
        print(json.dumps(output, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    run_example()
