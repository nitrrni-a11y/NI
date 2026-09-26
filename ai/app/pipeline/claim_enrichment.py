import os
from typing import List

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from sentence_transformers import SentenceTransformer

from app.pipeline.schemas import Claim, EnrichedClaim

_analyzer = None
_model = None

def get_analyzer():
    global _analyzer
    if _analyzer is None:
        _analyzer = SentimentIntensityAnalyzer()
    return _analyzer

def get_model():
    global _model
    if _model is None:
        model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
        _model = SentenceTransformer(model_name)
    return _model

def enrich_claims(claims: List[Claim]) -> List[EnrichedClaim]:
    if not claims:
        return []

    analyzer = get_analyzer()
    model = get_model()
    
    enriched = []
    
    for claim in claims:
        text = claim.text
        
        # 1. Sentiment Analysis
        scores = analyzer.polarity_scores(text)
        compound = scores['compound']
        
        if compound >= 0.05:
            sentiment = "positive"
        elif compound <= -0.05:
            sentiment = "negative"
        else:
            sentiment = "neutral"
            
        sentiment_confidence = round(abs(compound), 4)
        
        # 2. Embedding Generation
        vector = model.encode(text).tolist()
        
        enriched.append(EnrichedClaim(
            claim_id=claim.claim_id,
            document_id=claim.document_id,
            text=text,
            sentiment=sentiment,
            sentiment_confidence=sentiment_confidence,
            embedding=vector,
            source_metadata=claim.source_metadata
        ))
        
    return enriched
