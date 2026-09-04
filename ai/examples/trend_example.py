import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.trends.analyzer import analyze_narrative_trend

def run_example():
    observations_increasing = [
        {"date": "2026-08-01", "narrative_id": "NAR_001", "count": 5},
        {"date": "2026-08-08", "narrative_id": "NAR_001", "count": 10},
        {"date": "2026-08-15", "narrative_id": "NAR_001", "count": 14}
    ]
    
    observations_decreasing = [
        {"date": "2026-08-01", "narrative_id": "NAR_002", "count": 20},
        {"date": "2026-08-05", "narrative_id": "NAR_002", "count": 10},
        {"date": "2026-08-10", "narrative_id": "NAR_002", "count": 2}
    ]
    
    print("====================================")
    print("INPUT OBSERVATIONS (Increasing):")
    print("====================================")
    import json
    print(json.dumps(observations_increasing, indent=2))
    
    output_inc = analyze_narrative_trend(observations_increasing)
    print("\nOUTPUT:")
    print(json.dumps(output_inc, indent=2))
    
    print("\n====================================")
    print("INPUT OBSERVATIONS (Decreasing):")
    print("====================================")
    print(json.dumps(observations_decreasing, indent=2))
    
    output_dec = analyze_narrative_trend(observations_decreasing)
    print("\nOUTPUT:")
    print(json.dumps(output_dec, indent=2))

if __name__ == "__main__":
    run_example()
