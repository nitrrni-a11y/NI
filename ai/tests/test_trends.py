from app.trends.analyzer import analyze_narrative_trend

def test_analyze_trend_increasing():
    data = [
        {"date": "2026-01-01", "narrative_id": "N1", "count": 1},
        {"date": "2026-01-02", "narrative_id": "N1", "count": 5},
        {"date": "2026-01-03", "narrative_id": "N1", "count": 10}
    ]
    res = analyze_narrative_trend(data)
    assert res["narrative_id"] == "N1"
    assert res["trend"] == "increasing"

def test_analyze_trend_decreasing():
    data = [
        {"date": "2026-01-01", "narrative_id": "N2", "count": 10},
        {"date": "2026-01-02", "narrative_id": "N2", "count": 5},
        {"date": "2026-01-03", "narrative_id": "N2", "count": 1}
    ]
    res = analyze_narrative_trend(data)
    assert res["narrative_id"] == "N2"
    assert res["trend"] == "decreasing"

def test_analyze_trend_stable():
    data = [
        {"date": "2026-01-01", "narrative_id": "N3", "count": 5},
        {"date": "2026-01-02", "narrative_id": "N3", "count": 5},
        {"date": "2026-01-03", "narrative_id": "N3", "count": 5}
    ]
    res = analyze_narrative_trend(data)
    assert res["narrative_id"] == "N3"
    assert res["trend"] == "stable"

def test_analyze_trend_empty():
    assert analyze_narrative_trend([]) == {}

def test_analyze_trend_single_observation():
    data = [{"date": "2026-01-01", "narrative_id": "N4", "count": 5}]
    res = analyze_narrative_trend(data)
    assert res["trend"] == "stable"
    assert res["strength"] == 0.0
