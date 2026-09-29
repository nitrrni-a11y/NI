from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

# ============================================================
# RAW DOCUMENT
# ============================================================

class RawDocument(BaseModel):
    document_id: str = Field(..., description="Unique identifier for the document")
    text: str = Field(..., description="Raw text of the document")
    source: str = Field(default="Unknown", description="Source of the document")
    source_type: str = Field(default="Unknown", description="Type of the source")
    author: str = Field(default="Unknown", description="Author of the document")
    published_at: Optional[str] = Field(default=None, description="Publication date")
    collected_at: Optional[str] = Field(default=None, description="Collection date")

class PreprocessedDocument(BaseModel):
    document_id: str
    text: str
    metadata: Dict[str, Any]
    source: str
    source_type: str
    author: str
    published_at: Optional[str]
    collected_at: Optional[str]

class BasicEntity(BaseModel):
    text: str
    type: str
    source: str = "spacy"


class BasicSentence(BaseModel):
    sentence_id: str
    text: str
    topic_id: Optional[int] = None


class BasicDocumentAnalysis(BaseModel):
    document_id: str
    source: str
    source_type: str
    author: str
    language: str
    cleaned_text: str
    sentences: List[BasicSentence]
    entities: List[BasicEntity]
    topic_ids: List[int] = Field(default_factory=list)


class TopicResult(BaseModel):
    topic_id: int
    label: str
    keywords: List[str]
    sentence_ids: List[str]
    document_ids: List[str]


class BasicAnalysisRequest(BaseModel):
    documents: List[RawDocument]


class BasicAnalysisResponse(BaseModel):
    documents_processed: int
    sentences_processed: int
    topics_identified: int
    documents: List[BasicDocumentAnalysis]
    topics: List[TopicResult]
# ============================================================
# CLAIMS
# ============================================================

class Claim(BaseModel):
    claim_id: str
    document_id: str
    text: str
    source_metadata: Dict[str, Any]

class EnrichedClaim(BaseModel):
    claim_id: str
    document_id: str
    text: str
    sentiment: str
    sentiment_confidence: float
    embedding: List[float]
    source_metadata: Dict[str, Any]

class ClaimGroup(BaseModel):
    group_id: str
    claim_ids: List[str]
    claim_texts: List[str]

# ============================================================
# NARRATIVES
# ============================================================

class ExistingNarrative(BaseModel):
    narrative_id: str
    text: str

class Narrative(BaseModel):
    narrative_id: str
    text: str
    claim_ids: List[str]
    confidence: float

class NarrativeEvidence(BaseModel):
    claim_ids: List[str]
    document_ids: List[str]
    sources: List[str]

class NarrativeAnalysis(BaseModel):
    claim_count: int
    source_count: int
    sentiment: float
    temporal_information: Dict[str, Any]
    recurrence: str
    strength: float

class FinalNarrative(BaseModel):
    narrative_id: str
    narrative: str
    supporting_evidence: NarrativeEvidence
    analysis: NarrativeAnalysis
    intelligence: str
    recommendation: str

# ============================================================
# ENDPOINTS
# ============================================================

class ProcessDocumentResponse(BaseModel):
    document: PreprocessedDocument
    claims: List[EnrichedClaim]

class BatchRequest(BaseModel):
    documents: List[RawDocument]
    existing_narratives: List[ExistingNarrative] = Field(default_factory=list)

class ProcessBatchResponse(BaseModel):
    documents_processed: int
    claims_extracted: int
    groups_identified: int
    narratives: List[FinalNarrative]

class ProcessCSVResponse(BaseModel):
    filename: str
    total_rows: int
    documents: List[RawDocument]
