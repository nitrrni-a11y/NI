import os
from typing import Dict, Any
from sentence_transformers import SentenceTransformer

# ============================================================
# EMBEDDING GENERATION
# ============================================================
#
# Purpose:
# Generates a dense numerical vector (embedding) for a specific claim.
#
# Input:
# claim_id (str): The unique ID of the claim.
# claim_text (str): The text of the claim.
#
# Output:
# Dict containing the claim_id, the generated embedding (list of floats),
# the embedding dimension, and the model used.
#
# Why:
# Embeddings capture the semantic meaning of text. We need them to
# calculate similarities between different claims and group them into
# narratives (e.g. "placement improved" is similar to "better placements").
#
# Implementation:
# Uses `sentence-transformers` with the `all-MiniLM-L6-v2` model.
# - Model: all-MiniLM-L6-v2
# - Dimension: 384
# - Why selected: It is exceptionally fast, lightweight (~80MB), and 
#   runs easily on CPU while retaining high semantic accuracy. 
#   Perfect for a local processing layer.
# - Limitations: It's primarily optimized for English. (We translate 
#   non-English text earlier in the pipeline to mitigate this).

_model = None

def get_model():
    global _model
    if _model is None:
        model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
        _model = SentenceTransformer(model_name)
    return _model

def generate_embedding(claim_id: str, claim_text: str) -> Dict[str, Any]:
    """
    Generates a dense vector embedding for the given claim.
    
    Args:
        claim_id (str): ID of the claim.
        claim_text (str): Text of the claim.
        
    Returns:
        Dict: Structured result with the vector and metadata.
    """
    if not claim_id or not claim_text or not str(claim_text).strip():
        return {
            "claim_id": claim_id or "UNKNOWN",
            "embedding": [],
            "dimension": 0,
            "model": "none"
        }
        
    model = get_model()
    # encode() returns a numpy array, we convert to list for JSON serialization
    vector = model.encode(str(claim_text).strip()).tolist()
    
    return {
        "claim_id": claim_id,
        "embedding": vector,
        "dimension": len(vector),
        "model": model.get_sentence_embedding_dimension() # to verify dimension dynamically if needed
    }
