from typing import Dict, Any
from langdetect import detect, DetectorFactory
from deep_translator import GoogleTranslator

# Ensure consistent language detection results
DetectorFactory.seed = 0

# ============================================================
# LANGUAGE DETECTION + TRANSLATION
# ============================================================
#
# Purpose:
# Detects the original language of the text and translates it
# to English if necessary. 
#
# Input:
# Raw text string.
#
# Output:
# Dict containing original text, detected language, translated text
# (if translation occurred, else identical to original), and the final 
# processing language (always 'en').
#
# Why:
# The downstream NLP components (like NER and Sentiment Analysis)
# perform best (or only work) on English text. Translating early
# normalizes the pipeline without losing original source context.
#
# Important:
# We preserve the original text for reference or display in the UI.
#
# Implementation:
# - Uses `langdetect` for robust local language identification.
# - Uses `deep-translator` (GoogleTranslator backend) for free, 
#   unauthenticated translation that runs locally without API keys.

def process_language(text: str) -> Dict[str, Any]:
    """
    Detects the language of the input text and translates to English if it's not.
    
    Args:
        text (str): Input text to process.
        
    Returns:
        Dict: structured language metadata and translated text.
    """
    if not isinstance(text, str):
        text = str(text) if text is not None else ""
        
    text_clean = text.strip()
    
    if not text_clean:
        return {
            "original_text": text,
            "original_language": "unknown",
            "translated_text": text,
            "processing_language": "en"
        }
        
    try:
        # Detect language
        lang = detect(text_clean)
    except Exception:
        lang = "unknown"
        
    translated_text = text
    
    # Translate if language is detected and it is not English
    if lang != 'en' and lang != 'unknown':
        try:
            translator = GoogleTranslator(source=lang, target='en')
            translated_text = translator.translate(text_clean)
        except Exception as e:
            # Fallback to original text if translation fails
            # In a production environment, we might want to log this error.
            translated_text = text
            
    return {
        "original_text": text,
        "original_language": lang,
        "translated_text": translated_text,
        "processing_language": "en"
    }
