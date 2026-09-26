from typing import List

from app.pipeline.schemas import (
    RawDocument, 
    ProcessDocumentResponse, 
    BatchRequest, 
    ProcessBatchResponse
)

from app.pipeline.text_preprocessing import preprocess_document
from app.pipeline.claim_extraction import extract_claims
from app.pipeline.claim_enrichment import enrich_claims
from app.pipeline.claim_grouping import group_claims
from app.pipeline.narrative_generation import generate_and_resolve_narratives
from app.pipeline.narrative_analysis import analyze_narratives
from app.pipeline.narrative_intelligence import generate_intelligence

def process_document(raw_doc: RawDocument) -> ProcessDocumentResponse:
    # Stage 1
    preprocessed_doc = preprocess_document(raw_doc)
    
    # Stage 2
    claims = extract_claims(preprocessed_doc)
    
    # Stage 3
    enriched_claims = enrich_claims(claims)
    
    return ProcessDocumentResponse(
        document=preprocessed_doc,
        claims=enriched_claims
    )

def process_batch(batch_req: BatchRequest) -> ProcessBatchResponse:
    all_preprocessed = []
    all_enriched_claims = []
    
    # Document Level Stages
    for raw_doc in batch_req.documents:
        # Stage 1
        preprocessed = preprocess_document(raw_doc)
        all_preprocessed.append(preprocessed)
        
        # Stage 2
        claims = extract_claims(preprocessed)
        
        # Stage 3
        enriched = enrich_claims(claims)
        all_enriched_claims.extend(enriched)
        
    # Corpus Level Stages
    
    # Stage 4
    claim_groups = group_claims(all_enriched_claims)
    
    # Stage 5 & 6 (Generation & Identity Resolution)
    narratives = generate_and_resolve_narratives(claim_groups, batch_req.existing_narratives)
    
    # Stage 7 & 8 (Analysis & Evidence)
    analyzed_data = analyze_narratives(narratives, all_enriched_claims)
    
    # Stage 9 & 10 (Intelligence & Recommendation)
    final_narratives = generate_intelligence(analyzed_data)
    
    return ProcessBatchResponse(
        documents_processed=len(all_preprocessed),
        claims_extracted=len(all_enriched_claims),
        groups_identified=len(claim_groups),
        narratives=final_narratives
    )
