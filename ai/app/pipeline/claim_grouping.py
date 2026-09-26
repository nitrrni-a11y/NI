import uuid
import numpy as np
from typing import List
from sklearn.cluster import AgglomerativeClustering

from app.pipeline.schemas import EnrichedClaim, ClaimGroup

def group_claims(claims: List[EnrichedClaim], distance_threshold: float = 0.3) -> List[ClaimGroup]:
    if not claims:
        return []

    if len(claims) == 1:
        group_id = f"GRP_{uuid.uuid4().hex[:8]}"
        return [ClaimGroup(
            group_id=group_id,
            claim_ids=[claims[0].claim_id],
            claim_texts=[claims[0].text]
        )]

    valid_claims = [c for c in claims if c.embedding and len(c.embedding) > 0]
    
    if not valid_claims:
        return []

    embeddings = np.array([c.embedding for c in valid_claims])

    clustering = AgglomerativeClustering(
        n_clusters=None,
        metric="cosine",
        linkage="average",
        distance_threshold=distance_threshold
    )

    labels = clustering.fit_predict(embeddings)

    clusters = {}
    for i, label in enumerate(labels):
        if label not in clusters:
            clusters[label] = {
                "claim_ids": [],
                "claim_texts": []
            }
        clusters[label]["claim_ids"].append(valid_claims[i].claim_id)
        clusters[label]["claim_texts"].append(valid_claims[i].text)

    groups = []
    for label, data in clusters.items():
        group_id = f"GRP_{str(label).zfill(3)}_{uuid.uuid4().hex[:4]}"
        groups.append(ClaimGroup(
            group_id=group_id,
            claim_ids=data["claim_ids"],
            claim_texts=data["claim_texts"]
        ))

    return groups
