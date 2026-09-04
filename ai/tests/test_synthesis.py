from app.synthesis.synthesizer import generate_synthesis

def test_generate_synthesis_fallback():
    # Since no API key is set in the test environment (or if it is, we can't guarantee it),
    # we just test that it returns the proper structure and handles data cleanly.
    data = {"narratives": [{"narrative": "Test"}]}
    res = generate_synthesis(data)
    
    # Check that all keys from Pydantic schema exist
    assert "summary" in res
    assert "key_narratives" in res
    assert "supporting_evidence" in res
    assert "important_sources" in res
    assert "observations" in res
    assert "limitations" in res
    
    # Check types
    assert isinstance(res["key_narratives"], list)
    assert isinstance(res["summary"], str)

def test_generate_synthesis_empty():
    res = generate_synthesis({})
    assert res == {}
