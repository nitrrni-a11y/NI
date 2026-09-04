from app.stance.detector import detect_stance

def test_detect_stance_against():
    claim = "The new attendance policy is terrible."
    target = "attendance policy"
    res = detect_stance(claim, target)
    assert res["stance"] == "against"
    assert res["confidence"] > 0.4

def test_detect_stance_support():
    claim = "I completely agree with the new attendance rules."
    target = "attendance rules"
    res = detect_stance(claim, target)
    assert res["stance"] == "support"
    assert res["confidence"] > 0.4

def test_detect_stance_neutral():
    claim = "The sky is blue today."
    target = "attendance policy"
    res = detect_stance(claim, target)
    assert res["stance"] in ["neutral", "unclear"]

def test_detect_stance_empty():
    res = detect_stance("   ", "policy")
    assert res["stance"] == "unclear"
    assert res["confidence"] == 0.0

def test_detect_stance_no_target():
    res = detect_stance("The policy is bad", "   ")
    assert res["stance"] == "unclear"
    assert res["confidence"] == 0.0
