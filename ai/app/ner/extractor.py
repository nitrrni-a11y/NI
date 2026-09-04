import spacy
from typing import Dict, Any

# ============================================================
# NAMED ENTITY RECOGNITION (NER)
# ============================================================
#
# Purpose:
# Extracts structured entities (like People, Organizations, Locations)
# from the text.
#
# Input:
# Cleaned English text.
#
# Output:
# Dict containing a list of recognized entities with their text, 
# type (label), and character start/end offsets.
#
# Why:
# NER is crucial for understanding *who* or *what* a narrative is about.
# It helps in building cross-source networks of organizations and individuals.
#
# Important:
# The input text should preferably be English, as the model is English-specific.
# We map standard spaCy labels to cleaner, more standardized types.
#
# Implementation:
# Uses `spacy` with the `en_core_web_sm` model. It is extremely fast,
# runs locally, and requires no GPU, making it perfect for a development machine.

# Load the model lazily to avoid overhead if not used
_nlp = None

def get_nlp():
    global _nlp
    if _nlp is None:
        try:
            _nlp = spacy.load("en_core_web_sm")
        except OSError:
            raise RuntimeError(
                "spaCy model 'en_core_web_sm' not found. "
                "Please run: python -m spacy download en_core_web_sm"
            )
    return _nlp

# Standardized entity mapping
LABEL_MAP = {
    "PERSON": "PERSON",
    "ORG": "ORG",
    "GPE": "LOCATION",
    "LOC": "LOCATION",
    "DATE": "DATE",
    "EVENT": "EVENT",
    "MONEY": "MONEY",
    "PRODUCT": "PRODUCT",
    "WORK_OF_ART": "PRODUCT"
}

def extract_entities(text: str) -> Dict[str, Any]:
    """
    Extracts named entities from the text.
    
    Args:
        text (str): Input text.
        
    Returns:
        Dict: structured entities list.
    """
    if not isinstance(text, str) or not text.strip():
        return {"entities": []}
        
    nlp = get_nlp()
    doc = nlp(text)
    
    entities = []
    
    for ent in doc.ents:
        # Only keep entities we care about
        if ent.label_ in LABEL_MAP:
            entities.append({
                "text": ent.text,
                "type": LABEL_MAP[ent.label_],
                "start": ent.start_char,
                "end": ent.end_char
            })
            
    return {"entities": entities}
