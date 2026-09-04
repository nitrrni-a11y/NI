from app.narratives.detector import detect_narrative

def test_detect_narrative_basic():
    group = {
        "group_id": "G1",
        "claim_ids": ["C1"],
        "claim_texts": ["This is a test claim."]
    }
    res = detect_narrative(group)
    assert "narrative_id" in res
    assert "narrative" in res
    assert res["claim_ids"] == ["C1"]
    assert res["narrative_id"].startswith("NAR_")

def test_detect_narrative_empty():
    res = detect_narrative({})
    assert res == {}

def test_detect_narrative_no_texts():
    group = {
        "group_id": "G1",
        "claim_ids": ["C1"],
        "claim_texts": []
    }
    res = detect_narrative(group)
    assert res == {}
