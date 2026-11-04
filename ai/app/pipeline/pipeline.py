from typing import List, Dict, Any, Tuple

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
    generate_narratives_batched,
    resolve_identity,
    update_matched_narrative,
    update_matched_narratives_batched
)
from app.pipeline.topic_assignment import assign_topic
from app.pipeline.cancellation import cancellation_manager
from app.pipeline.metrics import metrics_collector

def process_document(raw_doc: RawDocument) -> ProcessDocumentResponse:
    preprocessed_doc = preprocess_document(raw_doc)
    claims = extract_claims(preprocessed_doc)
    enriched_claims = enrich_claims(claims)
    return ProcessDocumentResponse(
        document=preprocessed_doc,
        claims=enriched_claims
    )

def process_batch(batch_req: BatchRequest) -> ProcessBatchResponse:
    run_id = batch_req.run_id
    metrics_collector.start_run(run_id)
    cancellation_manager.check_cancelled(run_id)

    all_preprocessed = []
    all_enriched_claims = []
    
    # 1. Document Level Stages
    for raw_doc in batch_req.documents:
        cancellation_manager.check_cancelled(run_id)
        preprocessed = preprocess_document(raw_doc, run_id=run_id)
        all_preprocessed.append(preprocessed)
        
        cancellation_manager.check_cancelled(run_id)
        claims = extract_claims(preprocessed)
        enriched = enrich_claims(claims)
        all_enriched_claims.extend(enriched)
        cancellation_manager.check_cancelled(run_id)
        
    # 2. Group Claims
    cancellation_manager.check_cancelled(run_id)
    claim_groups = group_claims(all_enriched_claims)
    cancellation_manager.check_cancelled(run_id)
    
    # Create quick map for looking up enriched claims by ID
    claim_map: Dict[str, EnrichedClaim] = {c.claim_id: c for c in all_enriched_claims}
    
    # 3. Deterministic Pre-Analysis for Claim Groups
    group_work_items: List[Dict[str, Any]] = []
    for group in claim_groups:
        cancellation_manager.check_cancelled(run_id)
        group_claims_list = [claim_map[cid] for cid in group.claim_ids if cid in claim_map]
        if not group_claims_list:
            continue
        evidence, analysis = analyze_claim_group(group_claims_list)
        group_work_items.append({
            "group": group,
            "claims": group_claims_list,
            "evidence": evidence,
            "analysis": analysis
        })

    # 4. Batched Narrative & Intelligence Generation (Gemini)
    # Reduces multiple sequential Gemini requests into batched requests
    cancellation_manager.check_cancelled(run_id)
    candidate_narratives = generate_narratives_batched(
        work_items=group_work_items,
        analysis_context=batch_req.analysis_context,
        run_id=run_id
    )
    cancellation_manager.check_cancelled(run_id)

    # 5. Topic Assignment (Groq) & Identity Resolution
    working_topics = list(batch_req.existing_topics)
    unmatched_narratives: List[FinalNarrative] = []
    matched_to_update: List[Dict[str, Any]] = []

    # Pair candidates with their original work items
    for idx, candidate_narrative in enumerate(candidate_narratives):
        cancellation_manager.check_cancelled(run_id)
        work_item = group_work_items[idx] if idx < len(group_work_items) else None

        # Topic assignment via Groq (preserves existing implementation)
        topic_id, topic_name, is_new = assign_topic(
            candidate_narrative.narrative, 
            working_topics, 
            batch_req.analysis_context,
            run_id=run_id
        )
        cancellation_manager.check_cancelled(run_id)

        candidate_narrative.topic_id = topic_id
        candidate_narrative.topic = topic_name
        candidate_narrative.is_new_topic = is_new

        # Dynamically update working topics list for subsequent narratives
        if is_new:
            if not any(t.topic_id == topic_id or t.name == topic_name for t in working_topics):
                working_topics.append(ExistingTopic(topic_id=topic_id, name=topic_name))

        # Resolve Identity against historical existing narratives
        matched_id = resolve_identity(candidate_narrative.narrative, batch_req.existing_narratives)

        if not matched_id:
            unmatched_narratives.append(candidate_narrative)
        else:
            matched_existing = next((en for en in batch_req.existing_narratives if en.narrative_id == matched_id), None)
            if matched_existing and work_item:
                matched_to_update.append({
                    "existing": matched_existing,
                    "new_group_claims": work_item["claims"],
                    "new_evidence": work_item["evidence"],
                    "new_analysis": work_item["analysis"],
                    "candidate": candidate_narrative
                })
            else:
                unmatched_narratives.append(candidate_narrative)

    # 6. Batched Matched Narrative Updates (if any narratives matched existing)
    final_narratives: List[FinalNarrative] = []
    cancellation_manager.check_cancelled(run_id)
    if matched_to_update:
        updated_narratives = update_matched_narratives_batched(
            matched_items=matched_to_update,
            analysis_context=batch_req.analysis_context,
            run_id=run_id
        )
        final_narratives.extend(updated_narratives)

    final_narratives.extend(unmatched_narratives)

    # 7. Metrics Reporting
    summary_text = metrics_collector.get_summary(run_id)
    print(summary_text)
    metrics_collector.finish_run(run_id)

    return ProcessBatchResponse(
        documents_processed=len(all_preprocessed),
        claims_extracted=len(all_enriched_claims),
        groups_identified=len(claim_groups),
        narratives=final_narratives,
        processed_documents=all_preprocessed,
        status="completed"
    )
