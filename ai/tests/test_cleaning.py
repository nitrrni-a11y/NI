from app.cleaning.cleaner import clean_text

def test_clean_text_basic():
    input_text = "NIT Raipur   has announced a new initiative!!!"
    result = clean_text(input_text)
    assert result["cleaned_text"] == "NIT Raipur has announced a new initiative!!!"
    assert result["metadata"]["chars_removed"] > 0

def test_clean_text_html():
    input_text = "<p>Visit &amp; learn</p>"
    result = clean_text(input_text)
    assert result["cleaned_text"] == "Visit & learn"

def test_clean_text_newlines():
    input_text = "Line 1\n\n\n\n\nLine 2"
    result = clean_text(input_text)
    assert result["cleaned_text"] == "Line 1\n\nLine 2"

def test_clean_text_empty():
    result = clean_text("   ")
    assert result["cleaned_text"] == ""
    assert result["metadata"]["is_empty"] is True

def test_clean_text_none():
    result = clean_text(None)
    assert result["cleaned_text"] == ""
    assert result["metadata"]["is_empty"] is True
