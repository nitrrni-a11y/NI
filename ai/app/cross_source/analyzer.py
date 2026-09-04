from typing import Dict, Any, List

# ============================================================
# CROSS-SOURCE ANALYSIS
# ============================================================
#
# Purpose:
# Analyzes a narrative to determine if it spans multiple independent
# information sources (e.g., News, Reddit, Twitter).
#
# Input:
# Dict containing narrative_id and a list of claims that support it.
# Each claim must have a 'source' attribute.
#
# Output:
# Dict detailing the breakdown of sources, total source count, and a boolean
# flag `cross_source` indicating if it spans multiple platforms.
#
# Why:
# A narrative pushed heavily by a single source (e.g., one blog) is often
# artificial or hyper-local. A narrative appearing across News, Reddit, 
# and YouTube simultaneously indicates widespread organic traction.
#
# Implementation:
# Iterates through the supporting claims of a narrative, groups them by
# their origin source, and counts frequencies. If source count > 1, 
# cross_source = true.

def analyze_cross_source(narrative_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyzes cross-source prevalence of a narrative based on its claims.
    
    Args:
        narrative_data (Dict): Contains 'narrative_id' and 'claims' list.
        
    Returns:
        Dict: structured cross-source results.
    """
    if not narrative_data:
        return {}
        
    narrative_id = narrative_data.get("narrative_id", "UNKNOWN")
    claims = narrative_data.get("claims", [])
    
    source_counts = {}
    
    for claim in claims:
        # If source is missing, we classify it as 'Unknown'
        source = claim.get("source", "Unknown")
        # Normalize the source name for consistent counting
        source_normalized = str(source).strip().title()
        
        if source_normalized not in source_counts:
            source_counts[source_normalized] = 0
        source_counts[source_normalized] += 1
        
    # Format the output list
    sources_list = []
    for src, count in source_counts.items():
        sources_list.append({
            "source": src,
            "claim_count": count
        })
        
    # Sort by claim count descending for cleaner presentation
    sources_list.sort(key=lambda x: x["claim_count"], reverse=True)
    
    source_count = len(sources_list)
    
    # A narrative is cross-source if it appears on > 1 distinct source platform.
    # Exclude "Unknown" if it's the only other source, depending on strictness.
    # Here, we strictly count distinct valid sources. If "Unknown" is the only source, count is 1.
    cross_source = source_count > 1
    
    return {
        "narrative_id": narrative_id,
        "sources": sources_list,
        "source_count": source_count,
        "cross_source": cross_source
    }
