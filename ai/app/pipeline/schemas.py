from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Any, Optional

# ============================================================
# RAW DOCUMENT
# ============================================================

class RawDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    document_id: str = Field(..., description="Unique identifier for the document")
    text: str = Field(..., description="Raw text of the document")
    original_text: Optional[str] = Field(default=None, alias="originalText", description="Original raw text")
    detected_language: Optional[str] = Field(default=None, alias="detectedLanguage", description="Detected language code")
    translated_text: Optional[str] = Field(default=None, alias="translatedText", description="Cached English translation if available")
    processing_text: Optional[str] = Field(default=None, alias="processingText", description="Text to be processed")
    translation_status: Optional[str] = Field(default=None, alias="translationStatus", description="Status: not_required, translated, failed, skipped")
    source: str = Field(default="Unknown", description="Source of the document")
    source_type: str = Field(default="Unknown", description="Type of the source")
    author: str = Field(default="Unknown", description="Author of the document")
    published_at: Optional[str] = Field(default=None, description="Publication date")
    collected_at: Optional[str] = Field(default=None, description="Collection date")

class PreprocessedDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    document_id: str
    text: str  # Kept for backward compatibility, equals processing_text
    original_text: str = Field(default="", alias="originalText", description="Original cleaned text before translation")
    detected_language: str = Field(default="en", alias="detectedLanguage", description="Detected language code (e.g. en, hi, te)")
    translated_text: Optional[str] = Field(default=None, alias="translatedText", description="English translation when applicable")
    processing_text: str = Field(default="", alias="processingText", description="Text passed to claim extraction")
    translation_status: str = Field(default="not_required", alias="translationStatus", description="not_required, translated, failed, or skipped")
    metadata: Dict[str, Any] = Field(default_factory=dict)
    source: str = "Unknown"
    source_type: str = "Unknown"
    author: str = "Unknown"
    published_at: Optional[str] = None
    collected_at: Optional[str] = None

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
    topic: str = "Unknown"
    claim_count: int = 0
    source_count: int = 0
    claim_ids: List[str] = Field(default_factory=list)
    document_ids: List[str] = Field(default_factory=list)
    sources: List[str] = Field(default_factory=list)
    sentiment: float = 0.0

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
    topic_id: str = Field(default="")
    topic: str
    narrative: str
    supporting_evidence: NarrativeEvidence
    analysis: NarrativeAnalysis
    intelligence: str
    recommendation: str
    is_new_topic: bool = False

class ExistingTopic(BaseModel):
    topic_id: str
    name: str

class EntityContext(BaseModel):
    entity_id: str
    entity_name: str
    entity_type: str
    domain: str

# ============================================================
# ENDPOINTS
# ============================================================

class ProcessDocumentResponse(BaseModel):
    document: PreprocessedDocument
    claims: List[EnrichedClaim]

class BatchRequest(BaseModel):
    documents: List[RawDocument]
    existing_narratives: List[ExistingNarrative] = Field(default_factory=list)
    analysis_context: EntityContext
    existing_topics: List[ExistingTopic] = Field(default_factory=list)

class ProcessBatchResponse(BaseModel):
    documents_processed: int
    claims_extracted: int
    groups_identified: int
    narratives: List[FinalNarrative]
    processed_documents: List[PreprocessedDocument] = Field(default_factory=list)

class ProcessCSVResponse(BaseModel):
    filename: str
    total_rows: int
    documents: List[RawDocument]

