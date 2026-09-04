from app.embeddings.generator import generate_embedding

def test_generate_embedding_basic():
    res = generate_embedding("CLM_01", "This is a test claim.")
    assert res["claim_id"] == "CLM_01"
    assert res["dimension"] > 0
    assert len(res["embedding"]) == res["dimension"]
    assert res["dimension"] == 384 # Since we use MiniLM by default

def test_generate_embedding_empty():
    res = generate_embedding("CLM_02", "   ")
    assert res["dimension"] == 0
    assert res["embedding"] == []

def test_generate_embedding_no_id():
    res = generate_embedding("", "Valid text without ID")
    assert res["claim_id"] == "UNKNOWN"
    assert res["dimension"] == 0 # Function returns empty if no ID provided as per our design
