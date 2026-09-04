import os
from typing import Dict, Any
from transformers import pipeline

# ============================================================
# STANCE DETECTION
# ============================================================
#
# Purpose:
# Detects the stance (support, against, neutral) of a claim 
# towards a specific TARGET.
#
# Input:
# claim_text (str): The atomic claim.
# target (str): The entity/concept the stance is evaluated against.
#
# Output:
# Dict containing the stance category and confidence score.
#
# Why:
# Sentiment != Stance. A sentence like "The new policy is terrible" 
# has negative sentiment, but its stance towards "protesting the policy"
# would be "support". Identifying the target is required.
#
# Implementation:
# Uses HuggingFace's Zero-Shot Classification pipeline. 
# We use `cross-encoder/nli-distilroberta-base` or a similar small MNLI model
# (like `valhalla/distilbart-mnli-12-1`) to keep inference fast and local.
# The model takes the claim and evaluates which label (e.g. "support [target]")
# is most entailed by the premise.

_classifier = None

def get_classifier():
    global _classifier
    if _classifier is None:
        # Using a highly efficient and small zero-shot classifier model
        model_name = os.getenv("STANCE_MODEL", "valhalla/distilbart-mnli-12-1")
        _classifier = pipeline("zero-shot-classification", model=model_name)
    return _classifier

def detect_stance(claim_text: str, target: str) -> Dict[str, Any]:
    """
    Detects the stance of a claim towards a target.
    
    Args:
        claim_text (str): The text of the claim.
        target (str): The target of the stance.
        
    Returns:
        Dict: structured stance results.
    """
    if not claim_text or not target or not str(claim_text).strip() or not str(target).strip():
        return {
            "stance": "unclear",
            "confidence": 0.0
        }
        
    claim_str = str(claim_text).strip()
    target_str = str(target).strip()
    
    # We formulate the candidate labels contextually
    labels = [
        f"support {target_str}",
        f"against {target_str}",
        f"neutral about {target_str}"
    ]
    
    try:
        classifier = get_classifier()
        result = classifier(claim_str, candidate_labels=labels)
        
        best_label = result['labels'][0]
        score = result['scores'][0]
        
        if score < 0.4:
            return {"stance": "unclear", "confidence": round(score, 4)}
            
        if "support" in best_label:
            stance = "support"
        elif "against" in best_label:
            stance = "against"
        else:
            stance = "neutral"
            
        return {
            "stance": stance,
            "confidence": round(score, 4)
        }
    except Exception as e:
        # Fallback if model fails to load or execute
        return {
            "stance": "unclear",
            "confidence": 0.0
        }
