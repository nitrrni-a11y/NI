from app.sentiment.analyzer import analyze_sentiment

def test_analyze_sentiment_positive():
    claim = {"claim_id": "CLM_01", "text": "This is absolutely wonderful and great!"}
    res = analyze_sentiment(claim)
    assert res["claim_id"] == "CLM_01"
    assert res["sentiment"] == "positive"
    assert res["confidence"] > 0.5

def test_analyze_sentiment_negative():
    claim = {"claim_id": "CLM_02", "text": "This is terrible, awful, and I hate it."}
    res = analyze_sentiment(claim)
    assert res["claim_id"] == "CLM_02"
    assert res["sentiment"] == "negative"
    assert res["confidence"] > 0.5

def test_analyze_sentiment_neutral():
    claim = {"claim_id": "CLM_03", "text": "The table is brown."}
    res = analyze_sentiment(claim)
    assert res["claim_id"] == "CLM_03"
    assert res["sentiment"] == "neutral"

def test_analyze_sentiment_empty():
    res = analyze_sentiment({"claim_id": "CLM_04", "text": "   "})
    assert res["sentiment"] == "neutral"
    assert res["confidence"] == 0.0

def test_analyze_sentiment_invalid_input():
    res = analyze_sentiment(None)
    assert res == {}
