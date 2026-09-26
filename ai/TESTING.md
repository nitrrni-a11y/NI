# AI Testing Guide

This guide is designed for developers to manually test the newly simplified 10-Stage Narrative Intelligence AI workflow end-to-end. Follow these exact steps.

## 1. Prerequisites

Ensure you are using Python 3.11+.

1. Activate your virtual environment:
   ```powershell
   cd ai
   .\venv\Scripts\Activate.ps1
   ```
2. Install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
3. Ensure `.env` is configured. The following keys are required:
   ```env
   GEMINI_API_KEY=your_gemini_key_here
   ```

---

## 2. Start the AI Server

Start the standalone FastAPI server:

```powershell
python -m uvicorn app.main:app --reload --port 8000
```
*(Leave this running in a terminal)*

---

## 3. Test Health Endpoint

Verify the server is running by hitting the `/health` endpoint.

**Request:**
```bash
curl -X GET http://localhost:8000/health
```

**Expected Response:**
```json
{
  "status": "ok"
}
```

---

## 4. Test One Complete Document (Stages 1-3)

**Purpose:** Verify the document-level pipeline (Text Preprocessing -> Claim Extraction -> Claim Enrichment). Note that narrative grouping and synthesis are NOT performed here.

**Request:**
```bash
curl -X POST http://localhost:8000/process/document \
-H "Content-Type: application/json" \
-d '{
  "document_id": "DOC_001",
  "text": "The new placement policies at NIT Raipur have significantly improved student outcomes this year. However, some students feel the process is too stressful.",
  "source": "Student Forum",
  "source_type": "Forum",
  "author": "StudentA",
  "published_at": "2023-10-15"
}'
```

**Expected Verification:**
1. Check `document` -> `metadata` for `chars_removed`.
2. Check `claims`. You should see at least two distinct claims (e.g., "Placement policies improved outcomes", "Students feel the process is stressful").
3. Verify **Sentiment**: First claim should be positive, second negative.
4. Verify **Embeddings**: Each claim should have an array of floats.

---

## 5. Test Multiple Documents (Corpus Pipeline: Stages 1-10)

**Purpose:** Process multiple documents simultaneously to test grouping, narrative synthesis, scoring, trending, intelligence, and recommendation.

**Request:**
```bash
curl -X POST http://localhost:8000/process/batch \
-H "Content-Type: application/json" \
-d '{
  "documents": [
    {
      "document_id": "DOC_001",
      "text": "Placement opportunities at NITRR have drastically improved this year.",
      "source": "News",
      "published_at": "2023-10-01"
    },
    {
      "document_id": "DOC_002",
      "text": "NIT Raipur recorded stronger placement outcomes this season compared to last year.",
      "source": "Official Website",
      "published_at": "2023-10-08"
    },
    {
      "document_id": "DOC_003",
      "text": "Students reported better recruitment opportunities during the latest drive.",
      "source": "Reddit",
      "published_at": "2023-10-15"
    },
    {
      "document_id": "DOC_004",
      "text": "The hostel food quality continues to be a major complaint among first-year students.",
      "source": "Reddit",
      "published_at": "2023-10-15"
    }
  ]
}'
```

*(Save the response to examine it).*

---

## 6. Verify Full Pipeline Traceability

1. **Claim Grouping (Stage 4):** Verify that Documents 1, 2, and 3 have their placement claims grouped under the same `claim_ids`. Document 4 should be in a separate narrative group.
2. **Narrative Generation (Stage 5):** A clean, LLM-generated sentence summarizing the group (e.g., "NIT Raipur's placement outcomes have improved this year.")
3. **Narrative Identity Resolution (Stage 6):** Record the generated `narrative_id` for the placement narrative (e.g., `NAR_1234abcd`). Run a second batch passing this ID in `existing_narratives`. Verify the old ID was reused if a similar claim is introduced.
4. **Narrative Analysis (Stage 7):** Check `analysis` for `claim_count`, `source_count`, `sentiment`, `recurrence`, and `strength`.
5. **Narrative Evidence (Stage 8):** Verify `supporting_evidence` maps the `claim_ids`, `document_ids`, and `sources`.
6. **Narrative-level Intelligence (Stage 9):** Check the `intelligence` string for a grounded summary of the analysis metrics.
7. **Narrative-level Recommendation (Stage 10):** Check the `recommendation` string for an actionable recommendation or an explicit statement of insufficient evidence.

---

## 7. Troubleshooting

- **`ModuleNotFoundError`**: Ensure you activated the virtual environment and ran `pip install -r requirements.txt`.
- **`GEMINI_API_KEY not found`**: Ensure your `.env` file is in the `ai/` folder and is populated.
- **Embedding generator extremely slow**: The `all-MiniLM-L6-v2` model will download on first run (~80MB). Subsequent runs are fast.
- **Validation Errors (422)**: Ensure your JSON payload strictly matches the Pydantic schemas.
- **Pydantic Warnings**: Benign third-party warnings from `google-genai` can be safely ignored.
- **`503 UNAVAILABLE`**: Gemini API is temporarily experiencing high traffic. Try again later.

---

## 8. What Success Looks Like

- [ ] FastAPI starts cleanly
- [ ] `/health` works
- [ ] Pipeline executes successfully without returning placeholder data
- [ ] Atomic claims are successfully extracted via Gemini
- [ ] Sentiment and Embeddings are generated successfully
- [ ] Claims group correctly based on cosine similarity
- [ ] Narratives are accurately generated
- [ ] Narrative IDs persist appropriately via Identity Resolution
- [ ] Scoring, Trends, and Cross-Source math executes correctly
- [ ] Narrative Evidence successfully correlates the chain of custody
- [ ] Narrative Intelligence generates a realistic intelligence brief for each narrative
- [ ] Narrative Recommendation issues a valid, bounded recommendation for each narrative
- [ ] Traceability: Intelligence -> Narrative ID -> Claim IDs -> Document IDs
