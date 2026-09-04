from app.claims.extractor import extract_claims

def test_extract_claims_basic():
    text = "NIT Raipur introduced a new AI laboratory. The laboratory will support student research."
    res = extract_claims(text)
    assert "claims" in res
    assert len(res["claims"]) >= 1
    
    # Check schema
    claim = res["claims"][0]
    assert "claim_id" in claim
    assert "text" in claim
    assert claim["claim_id"].startswith("CLM_")

def test_extract_claims_empty():
    res = extract_claims("   ")
    assert res["claims"] == []

def test_extract_claims_none():
    res = extract_claims(None)
    assert res["claims"] == []

def test_extract_claims_ids_are_unique():
    text = "Sentence one. Sentence two. Sentence three."
    res = extract_claims(text)
    
    ids = [c["claim_id"] for c in res["claims"]]
    assert len(ids) == len(set(ids)) # All IDs should be unique
