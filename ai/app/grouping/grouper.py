import uuid
import numpy as np
from typing import Dict, Any, List
from sklearn.cluster import AgglomerativeClustering

# ============================================================
# CLAIM GROUPING
# ============================================================
#
# Purpose:
# Groups semantically similar claims together.
#
# Input:
# List of claims, where each claim is a dict containing 'claim_id' and 'embedding'.
#
# Output:
# Dict containing a list of groups. Each group has a unique 'group_id'
# and a list of 'claim_ids' that belong to it.
#
# Why:
# To detect narratives, we must cluster individual atomic claims that talk
# about the same thing (e.g., "placements improved" and "better placement stats").
# We NEVER lose the original claim IDs so we can trace back evidence.
#
# Implementation:
# Uses `scikit-learn`'s `AgglomerativeClustering` with cosine distance.
# This approach doesn't require us to know the number of clusters (K) in advance.
# Instead, we set a distance threshold. Claims closer than the threshold
# are grouped together. This is highly efficient and deterministic for our scale.

def group_claims(claims: List[Dict[str, Any]], distance_threshold: float = 0.3) -> Dict[str, Any]:
    """
    Groups claims based on embedding similarity.
    
    Args:
        claims (List[Dict]): List of claim dicts, each must have 'claim_id' and 'embedding'.
        distance_threshold (float): Max cosine distance to be considered the same group.
                                    0.0 = identical, 1.0 = orthogonal.
                                    
    Returns:
        Dict: Structured grouping result.
    """
    if not claims:
        return {"groups": []}
        
    # If there's only one claim, it forms its own group
    if len(claims) == 1:
        group_id = f"GRP_{uuid.uuid4().hex[:8]}"
        return {
            "groups": [
                {
                    "group_id": group_id,
                    "claim_ids": [claims[0].get("claim_id", "UNKNOWN")]
                }
            ]
        }
        
    valid_claims = [c for c in claims if "claim_id" in c and "embedding" in c and len(c["embedding"]) > 0]
    
    if not valid_claims:
        return {"groups": []}
        
    embeddings = np.array([c["embedding"] for c in valid_claims])
    
    # Agglomerative Clustering using cosine distance
    clustering = AgglomerativeClustering(
        n_clusters=None,
        metric="cosine",
        linkage="average",
        distance_threshold=distance_threshold
    )
    
    labels = clustering.fit_predict(embeddings)
    
    # Organize by cluster label
    clusters = {}
    for i, label in enumerate(labels):
        if label not in clusters:
            clusters[label] = []
        clusters[label].append(valid_claims[i]["claim_id"])
        
    # Format output
    groups = []
    for label, claim_ids in clusters.items():
        group_id = f"GRP_{str(label).zfill(3)}_{uuid.uuid4().hex[:4]}"
        groups.append({
            "group_id": group_id,
            "claim_ids": claim_ids
        })
        
    return {"groups": groups}
