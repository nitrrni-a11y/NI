from typing import List

from app.pipeline.schemas import (
    BasicAnalysisRequest,
    BasicAnalysisResponse,
    BasicDocumentAnalysis,
    BasicSentence,
)

from app.pipeline.basic_analysis import analyze_documents
from app.pipeline.topic_extraction import extract_topics


def process_basic_analysis(
    request: BasicAnalysisRequest
) -> BasicAnalysisResponse:

    # Stages:
    # 1. Text preprocessing
    # 2. Language detection
    # 3. Sentence segmentation
    # 4. Entity extraction

    document_results, sentence_records = analyze_documents(
        request.documents
    )

    # Stages:
    # 5. Embeddings
    # 6. Topic clustering

    topics, sentence_topic_map = extract_topics(
        sentence_records
    )

    updated_documents = []

    for document in document_results:

        updated_sentences = []
        document_topic_ids = []

        for sentence in document.sentences:

            topic_id = sentence_topic_map.get(
                sentence.sentence_id
            )

            updated_sentences.append(
                BasicSentence(
                    sentence_id=sentence.sentence_id,
                    text=sentence.text,
                    topic_id=topic_id
                )
            )

            if topic_id is not None and topic_id not in document_topic_ids:
                document_topic_ids.append(topic_id)

        updated_documents.append(
            BasicDocumentAnalysis(
                document_id=document.document_id,
                source=document.source,
                source_type=document.source_type,
                author=document.author,
                language=document.language,
                cleaned_text=document.cleaned_text,
                sentences=updated_sentences,
                entities=document.entities,
                topic_ids=sorted(document_topic_ids)
            )
        )

    return BasicAnalysisResponse(
        documents_processed=len(updated_documents),
        sentences_processed=len(sentence_records),
        topics_identified=len(topics),
        documents=updated_documents,
        topics=topics
    )