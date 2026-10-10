# Narrative Intelligence AI Processing Layer

This directory contains the standalone AI/NLP processing layer for the Narrative Intelligence platform.

## 1. What the AI layer does
The AI layer is responsible for processing unstructured raw data (like news articles, social media posts) into structured, evidence-backed narrative intelligence. It processes documents through a highly modular **10-stage pipeline**:

1. **Text Preprocessing**: Cleans raw HTML and irregular whitespace.
2. **Claim Extraction**: Uses LLMs to extract atomic, factual claims.
3. **Claim Enrichment**: Adds VADER Sentiment and `sentence-transformers` semantic embeddings.
4. **Claim Grouping**: Clusters similar claims using Agglomerative Clustering and Cosine Similarity.
5. **Narrative Generation**: Synthesizes a broader narrative sentence from grouped claims.
6. **Narrative Identity Resolution**: Semantically compares new narratives against existing persistent narratives, reusing IDs when similarity crosses a threshold.
7. **Narrative Analysis**: Quantifies evidence strength, cross-source validation, and temporal trends.
8. **Narrative Evidence**: Establishes strict chain-of-custody (Narrative -> Claim -> Document -> Source).
9. **Narrative-level Intelligence**: Uses LLMs to generate a focused intelligence brief grounded strictly in the analysis metrics and evidence.
10. **Narrative-level Recommendation**: Uses LLMs to generate actionable recommendations based exclusively on the available evidence.

## 2. Architecture
The AI layer operates as a distinct microservice built using **Python 3.11** and **FastAPI**. It is completely decoupled from the main Node.js/Express backend and MongoDB database. It uses local, lightweight machine learning models (sentence-transformers, scikit-learn, VADER) for tasks that require speed and privacy, and delegates generative tasks (Claim Extraction, Narrative Generation, Intelligence) to Google's Gemini API with strict structured output validation via Pydantic.

## 3. Folder Structure
```text
ai/
├── app/
│   ├── main.py                    # FastAPI entry point
│   ├── pipeline/                  # Modular 10-Stage Pipeline
│   │   ├── schemas.py             # Centralized Pydantic definitions
│   │   ├── pipeline.py            # Main orchestrator
│   │   ├── text_preprocessing.py  # Stage 1
│   │   ├── claim_extraction.py    # Stage 2
│   │   ├── claim_enrichment.py    # Stage 3
│   │   ├── claim_grouping.py      # Stage 4
│   │   ├── narrative_generation.py# Stage 5 & 6
│   │   ├── narrative_analysis.py  # Stage 7 & 8
│   │   └── narrative_intelligence.py # Stage 9 & 10
├── requirements.txt               # Python dependencies
├── .env.example                   # Environment template
└── README.md                      # This file
```

## 4. API Endpoints

### `POST /process/batch`
Processes multiple documents simultaneously (e.g. 10 rows at a time).

**Input `BatchRequest` (JSON):**
```json
{
  "documents": [
    {
      "document_id": "D001",
      "text": "...",
      "source": "Reddit",
      "published_at": "2023-10-15"
    }
  ],
  "existing_narratives": [
    {
      "narrative_id": "NAR_xxxx",
      "text": "..."
    }
  ]
}
```

### `POST /process/csv`
A specialized route added solely for **local testing**. It allows you to upload a CSV file representing multiple documents. The route will parse the CSV, split it into batches of 10, run it through the core pipeline, and maintain cross-batch identity resolution context across the batches.

*Note: This route is for testing the AI pipeline locally. The production frontend/backend integration will be implemented separately by the respective team members.*

## 5. Backend Integration Contract
The Node.js Express backend must:
1. Divide the main document corpus into batches (e.g. `BATCH_SIZE = 10`).
2. Fetch previously generated `existing_narratives` from MongoDB (ID + text).
3. Send a POST request to `/process/batch` for Batch 1.
4. Receive the analyzed `narratives` array.
5. Upsert the narratives into MongoDB.
   - If `narrative_id` already exists, append new `claim_ids`/`document_ids` and update `analysis`, `intelligence`, and `recommendation`.
   - If `narrative_id` is new, insert a new record.
6. Repeat steps 2-5 for Batch 2, Batch 3, etc.

## 6. Installation & Virtual Environment Setup
1. `cd ai`
2. `python -m venv venv`
3. Activate virtual environment:
   - Windows: `venv\Scripts\activate`
   - Mac/Linux: `source venv/bin/activate`
4. `pip install -r requirements.txt`

## 7. Environment Variables
Copy `.env.example` to `.env` and provide your API keys:
```env
GEMINI_API_KEY=your-key-here
```

## 8. Testing the CSV Route (Swagger)
1. Start FastAPI:
   ```bash
   python -m uvicorn app.main:app --reload --port 8000
   ```
2. Open Swagger UI in your browser:
   [http://localhost:8000/docs](http://localhost:8000/docs)
3. Find the `POST /process/csv` endpoint and expand it.
4. Click **Try it out**.
5. Click **Choose File** and select your local CSV dataset.
6. Click **Execute**.
7. Inspect the structured JSON response detailing how the CSV was batched and resolved.

.\venv\Scripts\Activate.ps1        
pip install -r requirements.txt  
python -m uvicorn app.main:app --reload --port 8000