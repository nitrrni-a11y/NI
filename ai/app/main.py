import csv
import io
import math
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import traceback
from typing import List, Dict

from app.pipeline.schemas import (
    RawDocument, 
    ProcessDocumentResponse, 
    BatchRequest, 
    ProcessBatchResponse,
    ProcessCSVResponse,
    ExistingNarrative
)
from app.pipeline.pipeline import process_document, process_batch

app = FastAPI(
    title="Narrative Intelligence AI Processing",
    description="AI and NLP Processing Layer for Narrative Intelligence (10-Stage Architecture)",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    """
    Basic health check endpoint.
    """
    return {"status": "ok"}

@app.post("/process/document", response_model=ProcessDocumentResponse)
def process_document_endpoint(request: RawDocument):
    """
    Process ONE document through the document-level pipeline (Stages 1-3).
    """
    try:
        result = process_document(request)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process/batch", response_model=ProcessBatchResponse)
def process_batch_endpoint(request: BatchRequest):
    """
    Process MULTIPLE documents through the complete workflow (Stages 1-10).
    """
    if not request.documents:
        raise HTTPException(status_code=400, detail="No documents provided in batch.")
        
    try:
        result = process_batch(request)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process/csv", response_model=ProcessCSVResponse)
async def process_csv_endpoint(file: UploadFile = File(...)):
    """
    Process a CSV file containing multiple documents.
    The documents will be split into batches and run through the pipeline, maintaining narrative identity across batches.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a .csv file.")
        
    try:
        content = await file.read()
        try:
            text_content = content.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="CSV file must be UTF-8 encoded.")

        reader = csv.DictReader(io.StringIO(text_content))
        
        if reader.fieldnames is None:
            raise HTTPException(status_code=400, detail="CSV is empty or missing headers.")
            
        # Clean headers to handle dirty CSV files with trailing/leading whitespaces
        reader.fieldnames = [str(field).strip() for field in reader.fieldnames]
            
        text_col = next((col for col in ["raw_text", "text", "review", "content"] if col in reader.fieldnames), None)
        
        if not text_col:
            raise HTTPException(
                status_code=400, 
                detail=f"CSV must contain a text column (e.g., raw_text). Found headers: {reader.fieldnames}"
            )

        documents = []
        for i, row in enumerate(reader):
            # Clean row keys as well, since DictReader uses the *original* fieldnames for its internal row keys,
            # wait, if I changed reader.fieldnames, does DictReader use the new fieldnames for yielding rows?
            # Yes, modifying reader.fieldnames directly affects the keys in the yielded dictionaries.
            text_value = row.get(text_col)
            if not text_value or not str(text_value).strip():
                raise HTTPException(status_code=400, detail=f"Row {i+1} is missing text content.")
                
            doc_id = f"DOC_{i+1:03d}"
                
            doc = RawDocument(
                document_id=doc_id,
                text=str(text_value).strip(),
                source=row.get("source", "Unknown") if row.get("source") else "Unknown",
                source_type=row.get("source_type", "Unknown") if row.get("source_type") else "Unknown",
                author=row.get("author", "Unknown") if row.get("author") else "Unknown",
                published_at=row.get("published_date") or row.get("published_at") or None,
                collected_at=row.get("collected_at") or row.get("Timestamp") or None,
            )
            documents.append(doc)
            
        if not documents:
            raise HTTPException(status_code=400, detail="CSV is empty.")

        return ProcessCSVResponse(
            filename=file.filename,
            total_rows=len(documents),
            documents=documents
        )

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
