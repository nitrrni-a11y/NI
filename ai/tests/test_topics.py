from app.topics.identifier import identify_topics

def test_identify_topics_basic():
    text = "NIT Raipur students received several placement offers from technology companies this year."
    res = identify_topics(text)
    assert "topics" in res
    assert len(res["topics"]) <= 3
    # It should catch things like 'nit raipur', 'placement offers', 'technology companies'
    # Exact keywords may vary by TF-IDF tokenization, but list should not be empty
    assert len(res["topics"]) > 0

def test_identify_topics_empty():
    res = identify_topics("   ")
    assert res["topics"] == []

def test_identify_topics_none():
    res = identify_topics(None)
    assert res["topics"] == []

def test_identify_topics_stopwords_only():
    res = identify_topics("This is a the and to from")
    assert res["topics"] == []
