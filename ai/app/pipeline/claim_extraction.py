import re
import uuid
from typing import List

from pydantic import BaseModel
from app.pipeline.schemas import PreprocessedDocument, Claim

def is_meaningful_claim(sentence: str) -> bool:
    """
    Rule-based filtering to determine if a sentence is a valid factual claim.
    """
    s = sentence.strip()
    
    if not s:
        return False
        
    # Ignore questions and introductory list headers
    if s.endswith('?') or s.endswith(':'):
        return False
        
    words = s.split()
    
    # Meaningful claims require at least 4 words
    if len(words) < 4:
        return False
        
    # Ignore obvious greetings / non-informational text
    greetings = {"hi", "hello", "hey", "thanks", "thank you", "good morning", "good evening"}
    lower_s = s.lower()
    for g in greetings:
        if lower_s.startswith(g):
            return False
            
    # Filter common website navigation, marketing, and footer boilerplate
    boilerplate_phrases = [
        "download the", "click here", "read more", "fyi check",
        "discover the latest", "personal finance insights",
        "find the best of", "terms and conditions", "privacy policy",
        "all rights reserved", "subscribe to", "share on twitter",
        "follow us on", "advertisement", "sign up for"
    ]
    for bp in boilerplate_phrases:
        if bp in lower_s:
            return False
            
    # Filter pure URLs or social media handles
    if s.startswith("http://") or s.startswith("https://") or "t.co/" in s or s.startswith("@"):
        return False

    return True

def split_into_sentences(text: str) -> List[str]:
    """
    Deterministic sentence splitter using regex with abbreviation protection.
    Prevents splitting on abbreviations like 'B.Tech', 'Ph.D.', 'No.', 'Prof.', etc.
    """
    t = text.strip()
    if not t:
        return []

    # Protect known abbreviations from being split
    abbrevs = [
        "B.Tech", "M.Tech", "Ph.D", "Ph.d", "B.Sc", "M.Sc", "B.A", "M.A",
        "Dr", "Mr", "Mrs", "Ms", "Prof", "No", "F. No", "vs", "e.g", "i.e",
        "Ltd", "Pvt", "Inc", "Co", "Dept", "Rs", "B. Tech", "M. Tech"
    ]
    for ab in abbrevs:
        pattern = re.compile(rf'\b{re.escape(ab)}\.', re.IGNORECASE)
        t = pattern.sub(f'{ab}__DOT__', t)

    # Protect single capital initials (e.g., 'F. No.', 'A. Smith')
    t = re.sub(r'\b([A-Z])\.\s+(?=[A-Z])', r'\1__DOT__ ', t)

    # Split on punctuation followed by whitespace and a capital letter
    raw_sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', t)
    
    # Also handle newlines and restore dots
    result = []
    for s in raw_sentences:
        for sub_s in re.split(r'\n+', s):
            clean = sub_s.replace('__DOT__', '.').strip()
            if clean:
                result.append(clean)
                
    return result

def extract_claims(doc: PreprocessedDocument) -> List[Claim]:
    """
    Extract literal claim spans deterministically from the preprocessed document.
    Consistently uses processing_text to ensure translated English text is used.
    """
    if getattr(doc, "translation_status", None) == "failed":
        return []

    if getattr(doc, "detected_language", "en") != "en" and getattr(doc, "translation_status", None) != "translated":
        return []

    target_text = (getattr(doc, "processing_text", None) or doc.text or "").strip()
    if not target_text:
        return []

    # Simple deterministic segmentation
    raw_sentences = split_into_sentences(target_text)
    
    claims = []
    for i, s in enumerate(raw_sentences):
        if is_meaningful_claim(s):
            uid = uuid.uuid4().hex[:6]
            claims.append(Claim(
                claim_id=f"CLM_{str(i + 1).zfill(3)}_{uid}",
                document_id=doc.document_id,
                text=s,
                source_metadata={
                    "source": doc.source,
                    "source_type": doc.source_type,
                    "author": doc.author,
                    "published_at": doc.published_at,
                    "collected_at": doc.collected_at,
                    "detected_language": getattr(doc, "detected_language", "en"),
                    "translation_status": getattr(doc, "translation_status", "not_required")
                }
            ))

    return claims
