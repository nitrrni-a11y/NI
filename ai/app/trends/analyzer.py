import numpy as np
from datetime import datetime
from typing import List, Dict, Any

# ============================================================
# TREND ANALYSIS
# ============================================================
#
# Purpose:
# Determines whether a narrative's frequency is increasing, 
# decreasing, or stable over time.
#
# Input:
# List of observation dictionaries, containing 'date', 'narrative_id',
# and 'count'.
#
# Output:
# Dict with the narrative_id, the trend category (increasing, decreasing, stable),
# and a strength score of that trend.
#
# Why:
# Tracking how a narrative evolves over time helps identify emerging issues
# versus dying topics. Simple comparison of first and last values is vulnerable
# to outliers.
#
# Implementation:
# Uses standard Linear Regression via `numpy.polyfit` to calculate the slope
# of the observation counts over time (days since the first observation). 
# A positive slope indicates increasing, negative decreasing, near-zero stable.
# R-squared (correlation coefficient squared) is used as the trend strength.

def analyze_narrative_trend(observations: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Analyzes the trend of a narrative from dated observations.
    
    Args:
        observations (List[Dict]): List of observation dictionaries.
        
    Returns:
        Dict: structured trend result.
    """
    if not observations:
        return {}
        
    # Get the narrative ID from the first observation
    narrative_id = observations[0].get("narrative_id", "UNKNOWN")
    
    if len(observations) < 2:
        # Not enough data for a trend
        return {
            "narrative_id": narrative_id,
            "trend": "stable",
            "strength": 0.0
        }
        
    # Parse dates and sort
    parsed_obs = []
    for obs in observations:
        if "date" in obs and "count" in obs:
            try:
                dt = datetime.strptime(obs["date"], "%Y-%m-%d")
                parsed_obs.append((dt, obs["count"]))
            except ValueError:
                continue
                
    if len(parsed_obs) < 2:
        return {
            "narrative_id": narrative_id,
            "trend": "stable",
            "strength": 0.0
        }
        
    parsed_obs.sort(key=lambda x: x[0])
    
    # Calculate days since start and prepare X and Y for regression
    start_date = parsed_obs[0][0]
    x_days = np.array([(obs[0] - start_date).days for obs in parsed_obs])
    y_counts = np.array([obs[1] for obs in parsed_obs])
    
    # If all observations occurred on the same day, we can't calculate a time trend
    if x_days[-1] == 0:
        return {
            "narrative_id": narrative_id,
            "trend": "stable",
            "strength": 0.0
        }
        
    # Linear Regression (degree 1 polynomial fit)
    # y = mx + c
    m, c = np.polyfit(x_days, y_counts, 1)
    
    # Calculate R-squared for trend strength
    # R^2 = 1 - (SS_res / SS_tot)
    y_pred = m * x_days + c
    ss_res = np.sum((y_counts - y_pred)**2)
    ss_tot = np.sum((y_counts - np.mean(y_counts))**2)
    
    if ss_tot == 0:
        r_squared = 1.0 # Perfect fit if perfectly horizontal
    else:
        r_squared = 1 - (ss_res / ss_tot)
        
    strength = max(0.0, min(float(r_squared), 1.0))
    
    # Determine trend category based on slope (m)
    # Threshold for 'stable' could depend on the scale, but we use a small epsilon
    epsilon = 0.1
    if m > epsilon:
        trend = "increasing"
    elif m < -epsilon:
        trend = "decreasing"
    else:
        trend = "stable"
        
    return {
        "narrative_id": narrative_id,
        "trend": trend,
        "strength": round(strength, 4)
    }
