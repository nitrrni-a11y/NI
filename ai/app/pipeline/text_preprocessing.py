import re
import html
from typing import Dict, Any
from app.pipeline.schemas import RawDocument, PreprocessedDocument

def preprocess_document(raw_doc: RawDocument) -> PreprocessedDocument:
    text = raw_doc.text if isinstance(raw_doc.text, str) else str(raw_doc.text or "")
    
    if not text.strip():
        cleaned = ""
        chars_removed = 0
        original_length = len(text)
    else:
        original_length = len(text)
        cleaned = html.unescape(text)
        cleaned = re.sub(r'<[^>]+>', ' ', cleaned)
        cleaned = cleaned.replace('\xa0', ' ').replace('\t', ' ')
        cleaned = re.sub(r' *\n *', '\n', cleaned)
        cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
        cleaned = re.sub(r' {2,}', ' ', cleaned)
        cleaned = cleaned.strip()
        chars_removed = original_length - len(cleaned)

    return PreprocessedDocument(
        document_id=raw_doc.document_id,
        text=cleaned,
        metadata={
            "chars_removed": chars_removed,
            "original_length": original_length,
            "cleaned_length": len(cleaned),
            "is_empty": not bool(cleaned)
        },
        source=raw_doc.source,
        source_type=raw_doc.source_type,
        author=raw_doc.author,
        published_at=raw_doc.published_at,
        collected_at=raw_doc.collected_at
    )
