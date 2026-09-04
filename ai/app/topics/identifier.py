from typing import Dict, Any
from sklearn.feature_extraction.text import TfidfVectorizer
import spacy

# ============================================================
# TOPIC IDENTIFICATION
# ============================================================
#
# Purpose:
# Extracts the main topics or key phrases from a given text.
#
# Input:
# Cleaned English text.
#
# Output:
# Dict containing a list of top topics/keywords extracted from the text.
#
# Why:
# Identifying topics allows us to quickly tag, categorize, and filter
# claims and narratives in the UI without relying entirely on heavy LLMs.
#
# Implementation:
# Uses a combination of `spaCy` to extract meaningful noun chunks
# and `scikit-learn`'s `TfidfVectorizer` to score the most important
# chunks/unigrams. This approach is deterministic, extremely fast, 
# and runs entirely locally. It was chosen over an LLM to save latency
# and cost for simple tagging operations.

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

def identify_topics(text: str, top_n: int = 3) -> Dict[str, Any]:
    """
    Identifies the main topics/keywords from the text.
    
    Args:
        text (str): Input text.
        top_n (int): Number of top topics to return.
        
    Returns:
        Dict: structured topics list.
    """
    if not isinstance(text, str) or not text.strip():
        return {"topics": []}
        
    nlp = get_nlp()
    doc = nlp(text)
    
    # Extract candidate phrases (noun chunks and proper nouns)
    candidates = []
    for chunk in doc.noun_chunks:
        # Filter out common pronouns
        if chunk.root.pos_ != 'PRON':
            candidates.append(chunk.text.lower())
            
    # Add named entities as strong candidates
    for ent in doc.ents:
        if ent.label_ not in ['DATE', 'TIME', 'PERCENT', 'MONEY', 'QUANTITY', 'ORDINAL', 'CARDINAL']:
            candidates.append(ent.text.lower())

    if not candidates:
        # Fallback to simple unigrams/bigrams if no chunks are found
        candidates = [text.lower()]
        
    # We create a dummy corpus to use TF-IDF purely for scoring frequency
    # Since we only have one document, TF-IDF acts like term frequency (TF)
    # but we can filter stop words efficiently.
    try:
        vectorizer = TfidfVectorizer(stop_words='english', ngram_range=(1, 2))
        X = vectorizer.fit_transform(candidates)
        
        # Sum the TF-IDF scores for each feature across all candidates
        scores = X.sum(axis=0).A1
        features = vectorizer.get_feature_names_out()
        
        # Sort features by score
        sorted_indices = scores.argsort()[::-1]
        
        top_topics = []
        seen = set()
        for idx in sorted_indices:
            topic = features[idx]
            # Avoid duplicate sub-strings (e.g., if we have 'nit raipur' and 'raipur', prefer 'nit raipur')
            if not any(topic in s or s in topic for s in seen):
                top_topics.append(topic)
                seen.add(topic)
            if len(top_topics) >= top_n:
                break
                
        return {"topics": top_topics}
        
    except ValueError:
        # Happens if vectorizer receives only stop words
        return {"topics": []}
