import re
import html
from typing import Dict, Any


# ============================================================
# DATA CLEANING
# ============================================================

def clean_text(text: str) -> Dict[str, Any]:
    """
    Cleans the raw input text safely to prepare it for NLP pipelines.
    """

    if not isinstance(text, str):
        text = str(text) if text is not None else ""

    if not text.strip():
        return {
            "original_text": text,
            "cleaned_text": "",
            "metadata": {
                "chars_removed": 0,
                "is_empty": True
            }
        }

    original_length = len(text)

    # 1. Unescape HTML entities
    cleaned = html.unescape(text)

    # 2. Remove basic HTML tags
    cleaned = re.sub(r'<[^>]+>', ' ', cleaned)

    # 3. Normalize special whitespace
    cleaned = cleaned.replace('\xa0', ' ').replace('\t', ' ')

    # 4. Remove spaces around newlines
    cleaned = re.sub(r' *\n *', '\n', cleaned)

    # 5. Collapse multiple newlines to a maximum of two
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)

    # 6. Collapse multiple spaces into a single space
    cleaned = re.sub(r' {2,}', ' ', cleaned)

    # 7. Trim leading and trailing whitespace
    cleaned = cleaned.strip()

    chars_removed = original_length - len(cleaned)

    return {
        "original_text": text,
        "cleaned_text": cleaned,
        "metadata": {
            "chars_removed": chars_removed,
            "original_length": original_length,
            "cleaned_length": len(cleaned),
            "is_empty": False
        }
    }