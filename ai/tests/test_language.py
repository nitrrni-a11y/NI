from app.language.processor import process_language

def test_language_english():
    text = "NIT Raipur is a prestigious institution."
    res = process_language(text)
    assert res["original_language"] == "en"
    assert res["processing_language"] == "en"
    assert res["translated_text"] == text

def test_language_hindi():
    text = "एनआईटी रायपुर ने नई पहल शुरू की।"
    res = process_language(text)
    assert res["original_language"] == "hi"
    assert res["processing_language"] == "en"
    assert "NIT Raipur" in res["translated_text"] or "started a new initiative" in res["translated_text"].lower()

def test_language_empty():
    res = process_language("   ")
    assert res["original_language"] == "unknown"
    assert res["processing_language"] == "en"
    assert res["translated_text"] == "   "

def test_language_short():
    res = process_language("12345")
    # langdetect often struggles or throws exception on numbers, which we catch
    assert res["original_language"] in ["unknown", "en", "ca", "et"] # depends on what langdetect guesses
    assert res["processing_language"] == "en"
