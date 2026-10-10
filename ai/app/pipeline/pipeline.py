from typing import List, Dict

from app.pipeline.schemas import (
    RawDocument, 
    ProcessDocumentResponse, 
    BatchRequest, 
    ProcessBatchResponse,
    ExistingNarrative,
    FinalNarrative,
    EnrichedClaim,
    ExistingTopic
)

from app.pipeline.text_preprocessing import preprocess_document
from app.pipeline.claim_extraction import extract_claims
from app.pipeline.claim_enrichment import enrich_claims
from app.pipeline.claim_grouping import group_claims
from app.pipeline.narrative_analysis import analyze_claim_group
from app.pipeline.narrative_intelligence import (
    generate_new_narrative,
    resolve_identity,
    update_matched_narrative
)
from app.pipeline.topic_assignment import assign_topic

def process_document(raw_doc: RawDocument) -> ProcessDocumentResponse:
    preprocessed_doc = preprocess_document(raw_doc)
    claims = extract_claims(preprocessed_doc)
    enriched_claims = enrich_claims(claims)
    return ProcessDocumentResponse(
        document=preprocessed_doc,
        claims=enriched_claims
    )

def process_batch(batch_req: BatchRequest) -> ProcessBatchResponse:
    all_preprocessed = []
    all_enriched_claims = []
    
    # 1. Document Level Stages
    for raw_doc in batch_req.documents:
        preprocessed = preprocess_document(raw_doc)
        all_preprocessed.append(preprocessed)
        
        claims = extract_claims(preprocessed)
        enriched = enrich_claims(claims)
        all_enriched_claims.extend(enriched)
        
    # 2. Group Claims
    claim_groups = group_claims(all_enriched_claims)
    
    # Create a quick map for looking up enriched claims by ID
    claim_map: Dict[str, EnrichedClaim] = {c.claim_id: c for c in all_enriched_claims}
    
    final_narratives: List[FinalNarrative] = []
    
    # 1. Fetch existing topics once per batch (create a mutable working copy)
    working_topics = list(batch_req.existing_topics)
    
    # 3. Analyze and Generate Narratives
    for group in claim_groups:
        group_claims_list = [claim_map[cid] for cid in group.claim_ids if cid in claim_map]
        if not group_claims_list:
            continue
            
        # Group-level deterministic analysis BEFORE narrative generation
        evidence, analysis = analyze_claim_group(group_claims_list)
        
        # ONE LLM CALL for the new group (Narrative generation)
        candidate_narrative = generate_new_narrative(
            group, 
            evidence, 
            analysis, 
            batch_req.analysis_context
        )
        
        # Topic assignment via Gemma
        topic_id, topic_name, is_new = assign_topic(
            candidate_narrative.narrative, 
            working_topics, 
            batch_req.analysis_context
        )
        
        candidate_narrative.topic_id = topic_id
        candidate_narrative.topic = topic_name
        candidate_narrative.is_new_topic = is_new
        
        # Dynamically update topics list
        if is_new:
            # check if it really isn't in working_topics to avoid duplicates
            if not any(t.topic_id == topic_id or t.name == topic_name for t in working_topics):
                working_topics.append(ExistingTopic(topic_id=topic_id, name=topic_name))
        
        # Resolve Identity
        matched_id = resolve_identity(candidate_narrative.narrative, batch_req.existing_narratives)
        
        if not matched_id:
            # It's a completely new narrative
            final_narratives.append(candidate_narrative)
        else:
            # It matched an existing narrative. We must update the existing narrative.
            matched_existing = next((en for en in batch_req.existing_narratives if en.narrative_id == matched_id), None)
            if matched_existing:
                # Combine evidence
                combined_claim_ids = list(set(matched_existing.claim_ids + group.claim_ids))
                # For deterministic analysis, we ideally need the old EnrichedClaims. 
                # But since we only have the IDs, we can't fully rebuild them unless we fetch from DB.
                # Since AI service doesn't talk to DB directly, we just merge the stats deterministically.
                
                updated_narrative = update_matched_narrative(
                    existing=matched_existing,
                    new_group_claims=group_claims_list,
                    new_evidence=evidence,
                    new_analysis=analysis,
                    analysis_context=batch_req.analysis_context
                )
                final_narratives.append(updated_narrative)
            else:
                # Fallback if something went wrong
                final_narratives.append(candidate_narrative)
                
    return ProcessBatchResponse(
        documents_processed=len(all_preprocessed),
        claims_extracted=len(all_enriched_claims),
        groups_identified=len(claim_groups),
        narratives=final_narratives
    )
