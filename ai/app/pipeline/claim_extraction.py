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
        
    # Ignore questions
    if s.endswith('?'):
        return False
        
    words = s.split()
    
    # Ignore very short fragments (less than 3 words)
    if len(words) < 3:
        return False
        
    # Ignore obvious greetings / non-informational text
    greetings = {"hi", "hello", "hey", "thanks", "thank you", "good morning", "good evening"}
    lower_s = s.lower()
    for g in greetings:
        if lower_s.startswith(g):
            return False
            
    return True

def split_into_sentences(text: str) -> List[str]:
    """
    Fallback deterministic sentence splitter using Regex.
    Handles basic punctuation like '.', '!', '?'
    """
    # Split on punctuation followed by whitespace and a capital letter, or end of string
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text.strip())
    
    # Also handle cases with newlines
    result = []
    for s in sentences:
        for sub_s in re.split(r'\n+', s):
            if sub_s.strip():
                result.append(sub_s.strip())
                
    return result

def extract_claims(doc: PreprocessedDocument) -> List[Claim]:
    """
    Extract literal claim spans deterministically from the preprocessed document.
    """
    if not doc.text.strip():
        return []

    # Simple deterministic segmentation
    raw_sentences = split_into_sentences(doc.text)
    
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
                    "collected_at": doc.collected_at
                }
            ))

    return claims
