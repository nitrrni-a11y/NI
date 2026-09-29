import csv
import io
import traceback

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from app.pipeline.schemas import (
    RawDocument,
    ProcessDocumentResponse,
    BatchRequest,
    ProcessBatchResponse,
    ProcessCSVResponse,
    BasicAnalysisRequest,
    BasicAnalysisResponse,
)

from app.pipeline.pipeline import (
    process_document,
    process_batch,
)

from app.pipeline.basic_pipeline import process_basic_analysis


app = FastAPI(
    title="Narrative Intelligence AI Processing",
    description="AI and NLP Processing Layer for Narrative Intelligence",
    version="2.0.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health")
def health_check():
    return {"status": "ok"}


# ============================================================
# BASIC NLP PIPELINE
# Stages:
# 1. Text preprocessing
# 2. Language detection
# 3. Sentence segmentation
# 4. Entity extraction
# 5. Embeddings
# 6. Topic extraction
# ============================================================

@app.post(
    "/process/basic",
    response_model=BasicAnalysisResponse
)
def process_basic_endpoint(request: BasicAnalysisRequest):

    if not request.documents:
        raise HTTPException(
            status_code=400,
            detail="No documents provided."
        )

    try:
        result = process_basic_analysis(request)
        return result

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ============================================================
# DOCUMENT PIPELINE
# ============================================================

@app.post(
    "/process/document",
    response_model=ProcessDocumentResponse
)
def process_document_endpoint(request: RawDocument):

    try:
        result = process_document(request)
        return result

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ============================================================
# COMPLETE BATCH PIPELINE
# ============================================================

@app.post(
    "/process/batch",
    response_model=ProcessBatchResponse
)
def process_batch_endpoint(request: BatchRequest):

    if not request.documents:
        raise HTTPException(
            status_code=400,
            detail="No documents provided in batch."
        )

    try:
        result = process_batch(request)
        return result

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ============================================================
# CSV UPLOAD
# ============================================================

@app.post(
    "/process/csv",
    response_model=ProcessCSVResponse
)
async def process_csv_endpoint(
    file: UploadFile = File(...)
):

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload a .csv file."
        )

    try:
        content = await file.read()

        try:
            text_content = content.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=400,
                detail="CSV file must be UTF-8 encoded."
            )

        reader = csv.DictReader(
            io.StringIO(text_content)
        )

        if reader.fieldnames is None:
            raise HTTPException(
                status_code=400,
                detail="CSV is empty or missing headers."
            )

        # Clean column names
        reader.fieldnames = [
            str(field).strip()
            for field in reader.fieldnames
        ]

        # Find a text column
        text_col = next(
            (
                col
                for col in [
                    "raw_text",
                    "text",
                    "review",
                    "content"
                ]
                if col in reader.fieldnames
            ),
            None
        )

        if not text_col:
            raise HTTPException(
                status_code=400,
                detail=(
                    "CSV must contain a text column "
                    "(e.g. raw_text). "
                    f"Found headers: {reader.fieldnames}"
                )
            )

        documents = []

        for i, row in enumerate(reader):

            text_value = row.get(text_col)

            if (
                not text_value
                or not str(text_value).strip()
            ):
                raise HTTPException(
                    status_code=400,
                    detail=f"Row {i + 1} is missing text content."
                )

            doc_id = f"DOC_{i + 1:03d}"

            document = RawDocument(
                document_id=doc_id,
                text=str(text_value).strip(),

                source=(
                    row.get("source")
                    if row.get("source")
                    else "Unknown"
                ),

                source_type=(
                    row.get("source_type")
                    if row.get("source_type")
                    else "Unknown"
                ),

                author=(
                    row.get("author")
                    if row.get("author")
                    else "Unknown"
                ),

                published_at=(
                    row.get("published_date")
                    or row.get("published_at")
                    or None
                ),

                collected_at=(
                    row.get("collected_at")
                    or row.get("Timestamp")
                    or None
                ),
            )

            documents.append(document)

        if not documents:
            raise HTTPException(
                status_code=400,
                detail="CSV is empty."
            )

        return ProcessCSVResponse(
            filename=file.filename,
            total_rows=len(documents),
            documents=documents
        )

    except HTTPException:
        raise

    except Exception as e:
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )