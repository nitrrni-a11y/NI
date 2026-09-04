from app.grouping.grouper import group_claims

def test_group_claims_basic():
    claims = [
        {"claim_id": "C1", "embedding": [1.0, 0.0, 0.0]},
        {"claim_id": "C2", "embedding": [0.99, 0.01, 0.0]},
        {"claim_id": "C3", "embedding": [0.0, 1.0, 0.0]},
    ]
    res = group_claims(claims, distance_threshold=0.1)
    assert "groups" in res
    assert len(res["groups"]) == 2
    
    # Find which group has C1
    group_with_c1 = next(g for g in res["groups"] if "C1" in g["claim_ids"])
    assert "C2" in group_with_c1["claim_ids"]
    assert "C3" not in group_with_c1["claim_ids"]

def test_group_claims_empty():
    assert group_claims([])["groups"] == []

def test_group_claims_single():
    claims = [{"claim_id": "C1", "embedding": [1.0, 0.0, 0.0]}]
    res = group_claims(claims)
    assert len(res["groups"]) == 1
    assert res["groups"][0]["claim_ids"] == ["C1"]

def test_group_claims_invalid_data():
    claims = [
        {"claim_id": "C1"}, # Missing embedding
        {"embedding": [1.0, 0.0]} # Missing ID
    ]
    res = group_claims(claims)
    assert res["groups"] == []
