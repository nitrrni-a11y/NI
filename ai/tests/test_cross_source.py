from app.cross_source.analyzer import analyze_cross_source

def test_analyze_cross_source_basic():
    data = {
        "narrative_id": "N1",
        "claims": [
            {"source": "News"},
            {"source": "Twitter"},
            {"source": "News"}
        ]
    }
    res = analyze_cross_source(data)
    assert res["narrative_id"] == "N1"
    assert res["source_count"] == 2
    assert res["cross_source"] == True
    
    sources = res["sources"]
    assert len(sources) == 2
    assert sources[0]["source"] == "News" # 2 claims
    assert sources[0]["claim_count"] == 2
    assert sources[1]["source"] == "Twitter" # 1 claim

def test_analyze_cross_source_single():
    data = {
        "narrative_id": "N2",
        "claims": [{"source": "Blog"}, {"source": "blog"}] # Should normalize
    }
    res = analyze_cross_source(data)
    assert res["source_count"] == 1
    assert res["cross_source"] == False
    assert res["sources"][0]["source"] == "Blog"
    assert res["sources"][0]["claim_count"] == 2

def test_analyze_cross_source_empty():
    assert analyze_cross_source({}) == {}

def test_analyze_cross_source_no_claims():
    res = analyze_cross_source({"narrative_id": "N3", "claims": []})
    assert res["source_count"] == 0
    assert res["cross_source"] == False
