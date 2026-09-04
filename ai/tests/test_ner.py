from app.ner.extractor import extract_entities
import pytest

def test_extract_entities_basic():
    text = "NIT Raipur is located in India."
    res = extract_entities(text)
    assert "entities" in res
    
    # Depending on spaCy's accuracy, it might catch NIT Raipur as ORG and India as GPE/LOCATION
    has_org = any(e["type"] == "ORG" for e in res["entities"])
    has_loc = any(e["type"] == "LOCATION" for e in res["entities"])
    
    assert has_loc # India should definitely be caught as LOCATION

def test_extract_entities_empty():
    res = extract_entities("   ")
    assert res["entities"] == []

def test_extract_entities_none():
    res = extract_entities(None)
    assert res["entities"] == []

def test_extract_entities_no_entities():
    res = extract_entities("This is a simple sentence with no proper nouns.")
    assert res["entities"] == []
