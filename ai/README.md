# Narrative Intelligence AI Processing Layer

This directory contains the standalone AI/NLP processing layer for the Narrative Intelligence platform.

## 1. What the AI layer does
The AI layer is responsible for processing unstructured raw data (like news articles, social media posts) into a structured, synthesized intelligence brief. It performs a 14-step pipeline to clean data, translate text, extract entities, identify topics, extract atomic claims, determine sentiment and stance, generate embeddings, group similar claims, detect broader narratives, score their strength, analyze trends over time, check for cross-source validation, and finally synthesize a human-readable report.

## 2. Architecture
The AI layer operates as a distinct microservice built using **Python 3.11** and **FastAPI**. It is completely decoupled from the main Node.js/Express backend and MongoDB database. It uses local, lightweight machine learning models (via spaCy, sentence-transformers, huggingface pipelines, scikit-learn, VADER) for tasks that require speed and privacy, and delegates complex generative tasks (like claim extraction and final synthesis) to Large Language Models via `litellm` using structured output validation (Pydantic).

## 3. Folder Structure
```text
ai/
├── app/
│   ├── main.py                # FastAPI entry point
│   ├── cleaning/              # Component 1
│   ├── language/              # Component 2
│   ├── ner/                   # Component 3
│   ├── topics/                # Component 4
│   ├── claims/                # Component 5
│   ├── sentiment/             # Component 6
│   ├── stance/                # Component 7
│   ├── embeddings/            # Component 8
│   ├── grouping/              # Component 9
│   ├── narratives/            # Component 10
│   ├── scoring/               # Component 11
│   ├── trends/                # Component 12
│   ├── cross_source/          # Component 13
│   └── synthesis/             # Component 14
├── examples/                  # Standalone execution scripts for each component
├── tests/                     # Pytest suite for every component
├── requirements.txt           # Python dependencies
├── .env.example               # Environment template
└── README.md                  # This file
```

## 4. Components & 5. Input/Output & 6. Function Names & 7. Models & 8. Rationale

**1. Data Cleaning**
- **Function:** `clean_text(text: str)` in `app.cleaning.cleaner`
- **Input:** Raw string.
- **Output:** Cleaned string.
- **Approach:** Regex heuristics. Selected to remove HTML, URLs, and excessive whitespace while preserving important punctuation and casing.

**2. Language Detection + Translation**
- **Function:** `detect_and_translate(text: str)` in `app.language.processor`
- **Input:** Cleaned string.
- **Output:** `{"original_text": "...", "original_language": "...", "translated_text": "...", "processing_language": "en"}`
- **Approach:** `langdetect` and `deep-translator`. Selected because they are free, local, and do not require heavy models for simple mapping.

**3. Named Entity Recognition (NER)**
- **Function:** `extract_entities(text: str)` in `app.ner.extractor`
- **Input:** English string.
- **Output:** `{"entities": [{"text": "...", "label": "..."}]}`
- **Approach:** `spacy` (`en_core_web_sm`). Extremely fast local model capable of running on CPU with minimal latency.

**4. Topic Identification**
- **Function:** `identify_topics(text: str, top_n: int)` in `app.topics.identifier`
- **Input:** English string.
- **Output:** `{"topics": [...]}`
- **Approach:** `scikit-learn` TF-IDF with `spacy` noun chunks. Selected for deterministic, fast keyword extraction without invoking LLMs.

**5. Claim Extraction**
- **Function:** `extract_claims(text: str)` in `app.claims.extractor`
- **Input:** Document text.
- **Output:** `{"claims": [{"claim_id": "...", "text": "..."}]}`
- **Approach:** LLM (via `litellm` + Pydantic) with a `spacy` sentence boundary fallback. Selected because extracting atomic, factual claims requires advanced reasoning.

**6. Sentiment Analysis**
- **Function:** `analyze_sentiment(claim: dict)` in `app.sentiment.analyzer`
- **Input:** Claim dict with `text`.
- **Output:** `{"claim_id": "...", "sentiment": "positive|negative|neutral", "confidence": 0.xx}`
- **Approach:** `vaderSentiment`. Highly optimized for short texts/claims, requires no GPU, extremely fast.

**7. Stance Detection**
- **Function:** `detect_stance(claim_text: str, target: str)` in `app.stance.detector`
- **Input:** Claim text and Target entity.
- **Output:** `{"stance": "support|against|neutral|unclear", "confidence": 0.xx}`
- **Approach:** `transformers` zero-shot classification (`valhalla/distilbart-mnli-12-1`). Evaluates entailment locally. Stance differs from sentiment by targeting specific entities.

**8. Embedding Generation**
- **Function:** `generate_embedding(claim_id: str, claim_text: str)` in `app.embeddings.generator`
- **Input:** Claim ID and text.
- **Output:** `{"claim_id": "...", "embedding": [...], "dimension": 384, "model": "..."}`
- **Approach:** `sentence-transformers` (`all-MiniLM-L6-v2`). Small (80MB), fast, and maps semantics perfectly for clustering.

**9. Claim Grouping**
- **Function:** `group_claims(claims: list)` in `app.grouping.grouper`
- **Input:** List of claims with embeddings.
- **Output:** `{"groups": [{"group_id": "...", "claim_ids": [...]}]}`
- **Approach:** `scikit-learn` Agglomerative Clustering (cosine distance). Deterministic, scales well, doesn't require knowing `k` clusters beforehand.

**10. Narrative Detection**
- **Function:** `detect_narrative(claim_group: dict)` in `app.narratives.detector`
- **Input:** Group ID, claim IDs, and claim texts.
- **Output:** `{"narrative_id": "...", "narrative": "...", "claim_ids": [...], "confidence": 0.xx}`
- **Approach:** LLM (via `litellm` + Pydantic) with heuristic fallback. Best way to synthesize multiple semantic phrases into one coherent sentence.

**11. Narrative Scoring**
- **Function:** `score_narrative(narrative_data: dict)` in `app.scoring.scorer`
- **Input:** Narrative metrics (volume, sources, dates, confidence).
- **Output:** `{"narrative_id": "...", "score": 0.xx, "components": {...}}`
- **Approach:** Deterministic mathematical weighting formula. Transparent and avoids arbitrary LLM guesses.

**12. Trend Analysis**
- **Function:** `analyze_narrative_trend(observations: list)` in `app.trends.analyzer`
- **Input:** List of dated counts.
- **Output:** `{"narrative_id": "...", "trend": "increasing|decreasing|stable", "strength": 0.xx}`
- **Approach:** `numpy.polyfit` linear regression slope. Accurately determines trend velocity over time intervals instead of edge-point comparisons.

**13. Cross-Source Analysis**
- **Function:** `analyze_cross_source(narrative_data: dict)` in `app.cross_source.analyzer`
- **Input:** Narrative with supporting claims containing source metadata.
- **Output:** `{"narrative_id": "...", "sources": [...], "source_count": x, "cross_source": bool}`
- **Approach:** Deterministic grouping by source. Used to filter out astroturfed or hyper-local claims.

**14. Final LLM Synthesis**
- **Function:** `generate_synthesis(structured_results: dict)` in `app.synthesis.synthesizer`
- **Input:** Full structured pipeline data.
- **Output:** Pydantic-validated JSON containing Summary, Narratives, Evidence, Sources, Observations, and Limitations.
- **Approach:** LLM (via `litellm`). Converts structured intelligence into a human-readable executive brief while strictly separating evidence from interpretation.

## 9. Installation & 10. Virtual Environment Setup
1. `cd ai`
2. `python -m venv venv`
3. Activate virtual environment:
   - Windows: `venv\Scripts\activate`
   - Mac/Linux: `source venv/bin/activate`
4. `pip install -r requirements.txt`
5. `python -m spacy download en_core_web_sm`

## 11. Environment Variables
Copy `.env.example` to `.env` and provide your API keys:
```text
OPENAI_API_KEY=your-key-here
# Or use Gemini/Anthropic
# GEMINI_API_KEY=your-key-here
```
Note: LLM keys are only required for Claims Extraction, Narrative Detection, and Final Synthesis. If missing, deterministic fallbacks are used. No fake data is generated.

## 12. How to run examples
Every component has a standalone execution script in the `examples/` directory that can be modified directly to test arbitrary inputs:
```bash
python examples/cleaning_example.py
python examples/claims_example.py
# ... etc
```

## 13. How to run pytest
Ensure your virtual environment is active, then run:
```bash
python -m pytest
# or
pytest tests/
```

## 14. How to start FastAPI
```bash
uvicorn app.main:app --reload --port 8000
```
Verify at `http://127.0.0.1:8000/health`.

## 15. Limitations
- External LLM limits API speed for components 5, 10, and 14.
- `sentence-transformers` requires ~80MB memory footprint.
- Stance zero-shot classification uses a 1.6GB HuggingFace model, requiring initial download and ~2GB RAM on first execution.

## 16. Future integration
- Currently, this AI layer runs independently. In the future, a `/process` POST endpoint will be added to `main.py` which will sequence these 14 components.
- The Node.js Express backend will send batches of documents to this FastAPI service, receive the structured JSON, and persist the results in MongoDB.
- No direct connection between the AI layer and MongoDB is planned.
