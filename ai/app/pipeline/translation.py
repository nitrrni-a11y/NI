import os
import re
import time
import logging
from typing import Tuple, Optional, Dict, Any, List

from langdetect import detect_langs, DetectorFactory
from langdetect.lang_detect_exception import LangDetectException

from app.pipeline.schemas import RawDocument, PreprocessedDocument
from app.pipeline.gemini_utils import get_gemini_client, generate_with_retry, _sanitize_error

logger = logging.getLogger(__name__)

# Make langdetect deterministic across runs
DetectorFactory.seed = 0

# Maximum character limit per chunk for Gemini prompt
MAX_CHUNK_CHARS = 3000

# Default Gemini model used for faithful translation
DEFAULT_TRANSLATION_MODEL = os.getenv("GEMINI_TRANSLATION_MODEL", "gemini-3.5-flash-lite")

# Language code to human-readable name mapping
LANGUAGE_NAME_MAP: Dict[str, str] = {
    'hi': 'Hindi',
    'te': 'Telugu',
    'ta': 'Tamil',
    'bn': 'Bengali',
    'kn': 'Kannada',
    'ml': 'Malayalam',
    'mr': 'Marathi',
    'gu': 'Gujarati',
    'pa': 'Punjabi',
    'ur': 'Urdu',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'ru': 'Russian',
    'zh-CN': 'Chinese',
    'ja': 'Japanese',
    'ar': 'Arabic',
}

# Non-Latin script Unicode ranges for fast, reliable language classification
_SCRIPT_PATTERNS = [
    (re.compile(r'[\u0900-\u097F]'), 'hi'),  # Devanagari (Hindi, Marathi)
    (re.compile(r'[\u0C00-\u0C7F]'), 'te'),  # Telugu
    (re.compile(r'[\u0B80-\u0BFF]'), 'ta'),  # Tamil
    (re.compile(r'[\u0980-\u09FF]'), 'bn'),  # Bengali
    (re.compile(r'[\u0C80-\u0CFF]'), 'kn'),  # Kannada
    (re.compile(r'[\u0D00-\u0D7F]'), 'ml'),  # Malayalam
    (re.compile(r'[\u0A80-\u0AFF]'), 'gu'),  # Gujarati
    (re.compile(r'[\u0A00-\u0A7F]'), 'pa'),  # Gurmukhi (Punjabi)
    (re.compile(r'[\u0600-\u06FF]'), 'ar'),  # Arabic / Urdu
    (re.compile(r'[\u4E00-\u9FFF]'), 'zh-CN'),  # Chinese
    (re.compile(r'[\u3040-\u30FF]'), 'ja'),  # Japanese
    (re.compile(r'[\u0400-\u04FF]'), 'ru'),  # Cyrillic (Russian, etc.)
]


def detect_language(text: str) -> Tuple[str, float]:
    """
    Detects the language of the input text safely.
    Handles empty text, short text, non-Latin scripts, and mixed language content.
    Returns: (language_code, confidence_score)
    """
    s = text.strip() if isinstance(text, str) else ""
    if not s:
        return "unknown", 0.0

    # If text has virtually no alphabetic characters
    alpha_chars = [c for c in s if c.isalpha()]
    if len(alpha_chars) < 2:
        if any(c.isdigit() for c in s):
            return "en", 0.90
        return "unknown", 0.0

    total_alpha = len(alpha_chars)

    # 1. Non-Latin script detection (Devanagari, Telugu, Tamil, Arabic, etc.)
    for pattern, fallback_lang in _SCRIPT_PATTERNS:
        match_count = len(pattern.findall(s))
        if match_count >= 3 or (match_count / total_alpha > 0.05):
            return fallback_lang, 0.95

    # 2. Short pure-ASCII heuristic
    words = s.split()
    if len(words) <= 4 and all(c.isascii() for c in alpha_chars):
        return "en", 0.99

    # 3. Standard langdetect with confidence check
    try:
        langs = detect_langs(s)
        if langs:
            top = langs[0]
            if top.lang != "en" and top.prob < 0.70 and all(c.isascii() for c in alpha_chars):
                return "en", 0.85
            return top.lang, round(top.prob, 4)
        return "unknown", 0.0
    except LangDetectException:
        if all(c.isascii() for c in alpha_chars):
            return "en", 0.80
        return "unknown", 0.0


def split_text_into_chunks(text: str, max_chars: int = MAX_CHUNK_CHARS) -> List[str]:
    """
    Splits long text into safe chunks below the character limit (max_chars <= 3000).
    Splits preferentially at paragraph boundaries, then sentence boundaries (. ! ? । ॥ \n),
    and finally at word boundaries if necessary.
    """
    s = text.strip() if isinstance(text, str) else ""
    if not s or len(s) <= max_chars:
        return [s] if s else []

    # Regex matching sentence boundaries across Latin and Indic scripts
    sentence_split_regex = re.compile(r'(?<=[.!?।॥\n])\s+')

    paragraphs = re.split(r'\n{2,}', s)
    chunks = []
    current_chunk = []
    current_len = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        if len(para) <= max_chars and (current_len + len(para) + 2 <= max_chars):
            current_chunk.append(para)
            current_len += len(para) + 2
        else:
            if current_chunk:
                chunks.append("\n\n".join(current_chunk))
                current_chunk = []
                current_len = 0

            if len(para) <= max_chars:
                current_chunk.append(para)
                current_len = len(para)
            else:
                # Paragraph exceeds max_chars: split into sentences
                sentences = sentence_split_regex.split(para)
                for sent in sentences:
                    sent = sent.strip()
                    if not sent:
                        continue

                    if len(sent) > max_chars:
                        # Massive sentence without punctuation: split by words/spaces
                        words = sent.split(" ")
                        word_chunk = []
                        word_len = 0
                        for w in words:
                            if word_len + len(w) + 1 > max_chars:
                                if word_chunk:
                                    chunks.append(" ".join(word_chunk))
                                word_chunk = [w]
                                word_len = len(w)
                            else:
                                word_chunk.append(w)
                                word_len += len(w) + 1
                        if word_chunk:
                            chunks.append(" ".join(word_chunk))
                    elif current_len + len(sent) + 1 <= max_chars:
                        current_chunk.append(sent)
                        current_len += len(sent) + 1
                    else:
                        if current_chunk:
                            chunks.append(" ".join(current_chunk))
                        current_chunk = [sent]
                        current_len = len(sent)

    if current_chunk:
        chunks.append("\n\n".join(current_chunk))

    return chunks


def _translate_chunk_with_gemini(
    chunk: str,
    source_lang: str,
    doc_id: str = "unknown",
    chunk_index: int = 1,
    total_chunks: int = 1,
    model: str = DEFAULT_TRANSLATION_MODEL,
    max_retries: int = 3,
    client=None
) -> str:
    """
    Translates a single text chunk into English using Google Gemini LLM.
    - Reuses the shared Gemini client and rate limiter / retry handler.
    - Strict instruction: faithful translation without summarizing, rewriting, or extracting claims.
    - Preserves names, dates, numbers, URLs, and original meaning.
    - Logs doc_id, language, chunk number, duration, and sanitized error reason on failure.
    """
    if client is None:
        client = get_gemini_client()

    lang_name = LANGUAGE_NAME_MAP.get(
        source_lang,
        f"language '{source_lang}'" if source_lang and source_lang != "unknown" else "source language"
    )

    prompt = (
        f"You are a professional, high-fidelity translator.\n"
        f"Your task is to faithfully translate the following {lang_name} text into natural, fluent English.\n\n"
        f"CRITICAL TRANSLATION RULES:\n"
        f"1. Translate faithfully and accurately. Do NOT summarize, condense, rewrite, or add any facts.\n"
        f"2. Preserve all proper nouns, names of people, places, institutions, organizations, dates, times, numbers, percentages, currency, and URLs exactly as in the original.\n"
        f"3. Preserve the exact sentiment, tone, nuance, and intent of the original text.\n"
        f"4. Do NOT extract claims, summarize narratives, or analyze the text.\n"
        f"5. Do NOT include any explanations, preamble (e.g., 'Here is the translation:'), notes, or markdown formatting.\n"
        f"6. Output ONLY the raw English translation of the provided text.\n\n"
        f"Text to translate:\n"
        f"{chunk}"
    )

    t_start = time.time()
    try:
        from google.genai import types
        config = types.GenerateContentConfig(
            temperature=0.1,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)
        )

        response = generate_with_retry(
            client=client,
            model=model,
            contents=prompt,
            config=config,
            max_retries=max_retries
        )

        raw_text = (response.text or "").strip()
        # Clean any accidental code block markers from output
        if raw_text.startswith("```") and raw_text.endswith("```"):
            lines = raw_text.splitlines()
            if len(lines) >= 2:
                raw_text = "\n".join(lines[1:-1]).strip()

        duration = time.time() - t_start

        if raw_text:
            logger.info(
                f"[Translation-Chunk] Doc: {doc_id} | Lang: {source_lang} | "
                f"Chunk: {chunk_index}/{total_chunks} ({len(chunk)} chars) | "
                f"Duration: {duration:.2f}s | Status: OK"
            )
            return raw_text

        raise ValueError("Gemini returned an empty translation response.")

    except Exception as e:
        duration = time.time() - t_start
        sanitized_reason = _sanitize_error(str(e))
        logger.error(
            f"[Translation-Error] Doc: {doc_id} | Lang: {source_lang} | "
            f"Chunk: {chunk_index}/{total_chunks} ({len(chunk)} chars) | "
            f"Model: {model} | Reason: {sanitized_reason} | Duration: {duration:.2f}s"
        )
        raise


def translate_text(
    text: str,
    source_lang: str,
    target_lang: str = "en",
    max_retries: int = 3,
    doc_id: str = "unknown",
    model: str = DEFAULT_TRANSLATION_MODEL
) -> str:
    """
    Translates non-English text to English using Gemini LLM.
    - Automatically chunks long text exceeding safe character limits (< 3,000 chars).
    - Translates each chunk sequentially using Gemini with shared rate limiter and retries.
    - Recombines chunks in the exact original order.
    """
    if not text or not text.strip():
        return ""

    chunks = split_text_into_chunks(text, max_chars=MAX_CHUNK_CHARS)
    total_chunks = len(chunks)

    client = get_gemini_client()
    translated_chunks = []
    for idx, chunk in enumerate(chunks):
        trans = _translate_chunk_with_gemini(
            chunk=chunk,
            source_lang=source_lang,
            doc_id=doc_id,
            chunk_index=idx + 1,
            total_chunks=total_chunks,
            model=model,
            max_retries=max_retries,
            client=client
        )
        translated_chunks.append(trans)

    # Recombine in original order
    if total_chunks > 1 and "\n\n" in text:
        return "\n\n".join(translated_chunks)
    return " ".join(translated_chunks)


def process_document_language(
    preprocessed_doc: PreprocessedDocument,
    raw_doc: Optional[RawDocument] = None
) -> PreprocessedDocument:
    """
    Integrates language detection and conditional translation into PreprocessedDocument using Gemini.
    - If document is English, translation is skipped (translation_status='not_required').
    - If valid cached translation already exists, it is reused (translation_status='translated').
    - If document is non-English, chunks are translated into English using Gemini LLM.
    - If translation fails, translation_status is set to 'failed', processing_text is set to '',
      and error details are logged and recorded in metadata without crashing the batch.
    """
    cleaned_text = preprocessed_doc.original_text or preprocessed_doc.text or ""
    doc_id = preprocessed_doc.document_id

    # 1. Detect language
    detected_lang, confidence = detect_language(cleaned_text)
    preprocessed_doc.detected_language = detected_lang
    preprocessed_doc.metadata["detected_language"] = detected_lang
    preprocessed_doc.metadata["language_confidence"] = confidence

    # 2. Case: Empty or unidentifiable text
    if not cleaned_text.strip() or detected_lang == "unknown":
        preprocessed_doc.translation_status = "skipped"
        preprocessed_doc.processing_text = cleaned_text
        preprocessed_doc.text = cleaned_text
        logger.info(f"[Translation] Doc: {doc_id} | Detected: {detected_lang} | Needed: False | Status: skipped | Duration: 0.00s")
        return preprocessed_doc

    # 3. Case: English text -> Translation not required
    if detected_lang == "en":
        preprocessed_doc.translation_status = "not_required"
        preprocessed_doc.processing_text = cleaned_text
        preprocessed_doc.text = cleaned_text
        logger.info(f"[Translation] Doc: {doc_id} | Detected: en (conf: {confidence:.2f}) | Needed: False | Status: not_required | Duration: 0.00s")
        return preprocessed_doc

    # 4. Case: Non-English text -> Check for existing valid cached translation first
    if raw_doc and getattr(raw_doc, "translated_text", None) and raw_doc.translated_text.strip():
        raw_orig = getattr(raw_doc, "original_text", None) or getattr(raw_doc, "text", "")
        if getattr(raw_doc, "translation_status", None) == "translated" or (raw_orig and raw_orig.strip() == cleaned_text.strip()):
            preprocessed_doc.translation_status = "translated"
            preprocessed_doc.translated_text = raw_doc.translated_text.strip()
            preprocessed_doc.processing_text = raw_doc.translated_text.strip()
            preprocessed_doc.text = preprocessed_doc.processing_text
            preprocessed_doc.metadata["translation_source"] = "cached"
            preprocessed_doc.metadata["translation_provider"] = "gemini"
            preprocessed_doc.metadata["translation_model"] = DEFAULT_TRANSLATION_MODEL
            logger.info(f"[Translation] Doc: {doc_id} | Detected: {detected_lang} | Needed: True | Status: translated (cached) | Duration: 0.00s")
            return preprocessed_doc

    # 5. Non-English text -> Perform translation with Gemini LLM (with chunking)
    t_start = time.time()
    try:
        translated = translate_text(
            cleaned_text,
            source_lang=detected_lang,
            target_lang="en",
            max_retries=3,
            doc_id=doc_id,
            model=DEFAULT_TRANSLATION_MODEL
        )
        duration = time.time() - t_start

        if translated and translated.strip():
            preprocessed_doc.translation_status = "translated"
            preprocessed_doc.translated_text = translated.strip()
            preprocessed_doc.processing_text = translated.strip()
            preprocessed_doc.text = preprocessed_doc.processing_text
            preprocessed_doc.metadata["translation_duration_s"] = round(duration, 3)
            preprocessed_doc.metadata["translation_provider"] = "gemini"
            preprocessed_doc.metadata["translation_model"] = DEFAULT_TRANSLATION_MODEL
            preprocessed_doc.metadata["translation_source"] = "gemini"
            logger.info(
                f"[Translation-Summary] Doc: {doc_id} | Detected: {detected_lang} (conf: {confidence:.2f}) | "
                f"Total Length: {len(cleaned_text)} chars | Status: translated | Duration: {duration:.2f}s"
            )
        else:
            raise ValueError("Gemini returned empty translation.")

    except Exception as e:
        duration = time.time() - t_start
        err_msg = _sanitize_error(type(e).__name__ + (f": {e}" if str(e) else ""))
        logger.error(
            f"[Translation-Summary] Doc: {doc_id} | Detected: {detected_lang} | "
            f"Total Length: {len(cleaned_text)} chars | Status: failed | Error: {err_msg} | Duration: {duration:.2f}s"
        )
        preprocessed_doc.translation_status = "failed"
        preprocessed_doc.translated_text = None
        # Empty processing_text ensures non-English text is not passed to downstream English NLP
        preprocessed_doc.processing_text = ""
        preprocessed_doc.text = ""
        preprocessed_doc.metadata["translation_error"] = err_msg
        preprocessed_doc.metadata["translation_duration_s"] = round(duration, 3)
        preprocessed_doc.metadata["translation_provider"] = "gemini"
        preprocessed_doc.metadata["translation_model"] = DEFAULT_TRANSLATION_MODEL

    return preprocessed_doc
