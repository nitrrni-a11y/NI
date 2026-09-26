# Narrative Intelligence AI – Testing Guide

This guide provides a clean, simple reference to run the standalone AI server and test all available endpoints manually.

---

## 1. Setup & Run Commands

Follow these steps to start the AI server locally:

1. **Activate your virtual environment**
   ```powershell
   cd ai
   .\venv\Scripts\Activate.ps1
   ```
2. **Install dependencies**
   ```powershell
   pip install -r requirements.txt
   ```
3. **Verify API Key**
   Make sure your `.env` file contains your Gemini key:
   ```env
   GEMINI_API_KEY=your_gemini_key_here
   ```
4. **Start the Server**
   ```powershell
   python -m uvicorn app.main:app --reload --port 8000
   ```
   *The server is now running at `http://localhost:8000`*

---

## 2. Available Routes Overview

The server exposes 4 main endpoints. You can test them via terminal `curl`, or by navigating your browser to the Swagger UI: **http://localhost:8000/docs**

1. **`GET /health`** - Checks if the server is alive.
2. **`POST /process/csv`** - Normalizes a raw CSV file into JSON Documents. (No AI usage).
3. **`POST /process/document`** - Processes a single document through Stages 1-3 (Extraction & Enrichment).
4. **`POST /process/batch`** - Processes multiple documents through the full 10-Stage Pipeline (Grouping, Narratives, Analysis).

---

## 3. Route Details (Input / Output)

### A. Health Check
**Route:** `GET /health`  
**Purpose:** Verify server status.

**Expected Output:**
```json
{
  "status": "ok"
}
```

---

### B. CSV Normalization
**Route:** `POST /process/csv`  
**Purpose:** Cleans dirty headers and normalizes a CSV into structured JSON documents automatically. Generates temporary `DOC_XXX` IDs. *Bypasses AI completely.*

**Input (Form Data):**
Upload a `.csv` file via the Swagger UI or via Curl.
```bash
curl -X POST http://localhost:8000/process/csv -F "file=@dataset.csv"
```

**Expected Output:**
```json
{
  "filename": "dataset.csv",
  "total_rows": 52,
  "documents": [
    {
      "document_id": "DOC_001",
      "text": "The college placements were great this year.",
      "source": "Student Forum",
      "source_type": "Unknown",
      "author": "Unknown",
      "published_at": "9/25/2026",
      "collected_at": "9/25/2026"
    }
  ]
}
```

---

### C. Single Document Processing (Stages 1-3)
**Route:** `POST /process/document`  
**Purpose:** Extracts and enriches atomic claims from a single document.

**Input (JSON):**
```json
{
  "document_id": "DOC_001",
  "text": "The new placement policies at NIT Raipur have significantly improved student outcomes. However, some feel the process is too stressful.",
  "source": "Student Forum"
}
```

**Expected Output:**
A JSON object containing the parsed metadata and an array of extracted claims with sentiment and embeddings.
```json
{
  "document": {
    "document_id": "DOC_001",
    "metadata": { "chars_removed": 12 }
  },
  "claims": [
    {
      "claim_id": "CLM_...",
      "claim_text": "Placement policies improved outcomes",
      "sentiment": { "label": "positive", "score": 0.8 },
      "embedding": [0.015, -0.022, 0.08, ...]
    }
  ]
}
```

---

### D. Full Batch Pipeline (Stages 1-10)
**Route:** `POST /process/batch`  
**Purpose:** Processes a batch of JSON documents through the complete pipeline (grouping similar claims, synthesizing narratives, tracking evidence, and writing intelligence reports).

**Input (JSON):**
```json
{
  "documents": [
    {
      "document_id": "DOC_001",
      "text": "Placement opportunities at NITRR have drastically improved this year.",
      "source": "News"
    },
    {
      "document_id": "DOC_002",
      "text": "NIT Raipur recorded stronger placement outcomes this season compared to last year.",
      "source": "Official Website"
    }
  ]
}
```

**Expected Output:**
A JSON object tracking the full evolution of the batch into structured narratives.
```json
{
  "groups_identified": 1,
  "narratives": [
    {
      "narrative_id": "NAR_...",
      "narrative": "NIT Raipur's placement outcomes have improved this year.",
      "analysis": {
        "claim_count": 2,
        "source_count": 2,
        "sentiment": "positive",
        "recurrence": "high"
      },
      "supporting_evidence": {
        "claim_ids": ["CLM_1", "CLM_2"],
        "document_ids": ["DOC_001", "DOC_002"],
        "sources": ["News", "Official Website"]
      },
      "intelligence": "A strong positive trend is emerging across multiple sources indicating improved placement metrics.",
      "recommendation": "Highlight these placement successes in prospective student marketing materials."
    }
  ]
}
```

---

## 4. Pipeline Traceability Checklist

When testing `/process/batch`, you can manually verify success by ensuring:
- [ ] **Grouping**: Similar claims (e.g., about placements) are merged into the same narrative.
- [ ] **Traceability**: The `supporting_evidence` successfully links the `document_ids` -> `claim_ids` -> `narrative_id`.
- [ ] **Analysis**: Claim count, source count, and aggregated sentiment accurately reflect the underlying claims.
- [ ] **Intelligence**: The LLM writes a realistic, grounded brief for the narrative.

*(Note: Free-tier Gemini APIs may occasionally return `503 UNAVAILABLE` during high traffic when running large batches. Wait a few moments and try again).*
