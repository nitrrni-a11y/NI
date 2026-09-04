from typing import Dict, Any
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

# ============================================================
# SENTIMENT ANALYSIS
# ============================================================
#
# Purpose:
# Analyzes the sentiment of a specific atomic claim.
#
# Input:
# Dict containing claim details, minimally: {"claim_id": "...", "text": "..."}
#
# Output:
# Dict with the original claim_id, the assigned sentiment category
# (positive, negative, neutral), and a confidence/intensity score.
#
# Why:
# Understanding the sentiment of a claim is essential for analyzing 
# whether a narrative is generally positive or critical. Note that 
# sentiment is distinct from stance (a positive sentiment sentence 
# might still be "against" a specific target).
#
# Implementation:
# Uses `vaderSentiment`, a lexicon and rule-based sentiment analysis tool.
# We chose VADER over a transformer model because it is incredibly fast,
# uses practically no memory, requires no GPU, and is specifically tuned 
# for social media and short texts (which claims usually are). 
# It provides a compound score between -1 and 1.
# - compound >= 0.05: positive
# - compound <= -0.05: negative
# - else: neutral

_analyzer = None

def get_analyzer():
    global _analyzer
    if _analyzer is None:
        _analyzer = SentimentIntensityAnalyzer()
    return _analyzer

def analyze_sentiment(claim: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyzes the sentiment of a given claim.
    
    Args:
        claim (Dict): A dictionary containing 'claim_id' and 'text'.
        
    Returns:
        Dict: structured sentiment results.
    """
    if not claim or not isinstance(claim, dict):
        return {}
        
    claim_id = claim.get("claim_id", "UNKNOWN")
    text = claim.get("text", "")
    
    if not isinstance(text, str) or not text.strip():
        return {
            "claim_id": claim_id,
            "sentiment": "neutral",
            "confidence": 0.0
        }
        
    analyzer = get_analyzer()
    scores = analyzer.polarity_scores(text)
    compound = scores['compound']
    
    if compound >= 0.05:
        sentiment = "positive"
    elif compound <= -0.05:
        sentiment = "negative"
    else:
        sentiment = "neutral"
        
    # We map compound score (-1 to 1) to a 0 to 1 confidence approximation
    confidence = abs(compound)
    
    return {
        "claim_id": claim_id,
        "sentiment": sentiment,
        "confidence": round(confidence, 4)
    }
