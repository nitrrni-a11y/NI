from typing import Tuple, List

import spacy
from langdetect import detect, DetectorFactory
from langdetect.lang_detect_exception import LangDetectException

from app.pipeline.schemas import (
    RawDocument,
    BasicDocumentAnalysis,
    BasicSentence,
    BasicEntity,
)
from app.pipeline.text_preprocessing import preprocess_document


# Make language detection deterministic
DetectorFactory.seed = 0

_nlp = None


def get_nlp():
    global _nlp

    if _nlp is None:
        try:
            _nlp = spacy.load("en_core_web_sm")
        except OSError:
            raise RuntimeError(
                "spaCy model 'en_core_web_sm' is not installed. "
                "Run: python -m spacy download en_core_web_sm"
            )

    return _nlp


def detect_language(text: str) -> str:
    if not text.strip():
        return "unknown"

    try:
        return detect(text)
    except LangDetectException:
        return "unknown"


def analyze_document(raw_doc: RawDocument) -> BasicDocumentAnalysis:
    # Stage 1: text preprocessing
    preprocessed = preprocess_document(raw_doc)

    cleaned_text = preprocessed.text

    # Stage 2: language detection
    language = detect_language(cleaned_text)

    # Stage 3 + 4: sentence segmentation and entity extraction
    nlp = get_nlp()
    doc = nlp(cleaned_text)

    sentences = []

    for index, sent in enumerate(doc.sents):
        sentence_text = sent.text.strip()

        if not sentence_text:
            continue

        sentences.append(
            BasicSentence(
                sentence_id=f"{raw_doc.document_id}_S{index + 1:03d}",
                text=sentence_text
            )
        )

    entities = []

    # Our current spaCy model is English.
    # For non-English documents we detect the language but
    # don't pretend that English NER is reliable.
    if language == "en":
        seen = set()

        for ent in doc.ents:
            entity_text = ent.text.strip()

            if not entity_text:
                continue

            key = (entity_text.lower(), ent.label_)

            if key in seen:
                continue

            seen.add(key)

            entities.append(
                BasicEntity(
                    text=entity_text,
                    type=ent.label_,
                    source="spacy"
                )
            )

    return BasicDocumentAnalysis(
        document_id=raw_doc.document_id,
        source=raw_doc.source,
        source_type=raw_doc.source_type,
        author=raw_doc.author,
        language=language,
        cleaned_text=cleaned_text,
        sentences=sentences,
        entities=entities,
        topic_ids=[]
    )


def analyze_documents(
    documents: List[RawDocument]
) -> Tuple[List[BasicDocumentAnalysis], List[Tuple[str, str, str]]]:

    document_results = []
    sentence_records = []

    for raw_doc in documents:

        result = analyze_document(raw_doc)

        document_results.append(result)

        # Topic extraction currently uses the English embedding model.
        if result.language == "en":

            for sentence in result.sentences:

                sentence_records.append(
                    (
                        sentence.sentence_id,
                        result.document_id,
                        sentence.text
                    )
                )

    return document_results, sentence_records