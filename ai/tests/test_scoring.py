from app.scoring.scorer import score_narrative

def test_score_narrative_high():
    data = {
        "narrative_id": "N1",
        "claim_count": 100,
        "unique_sources": 5,
        "average_confidence": 1.0,
        "days_active": 7
    }
    res = score_narrative(data)
    assert res["narrative_id"] == "N1"
    assert res["score"] == 1.0 # Perfect score based on formula
    assert res["components"]["volume_score"] == 1.0

def test_score_narrative_low():
    data = {
        "narrative_id": "N2",
        "claim_count": 0,
        "unique_sources": 0,
        "average_confidence": 0.0,
        "days_active": 0
    }
    res = score_narrative(data)
    assert res["score"] == 0.0

def test_score_narrative_empty():
    res = score_narrative({})
    assert res == {}

def test_score_narrative_bounds():
    data = {
        "narrative_id": "N3",
        "claim_count": 10000, # Massive volume
        "unique_sources": 50, # Massive diversity
        "average_confidence": 2.0, # Invalid confidence, should be capped at 1.0
        "days_active": 100
    }
    res = score_narrative(data)
    assert res["score"] == 1.0 # Must never exceed 1.0
