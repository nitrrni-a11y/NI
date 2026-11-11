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
    temporal_information: Dict[str, Any] = Field(default_factory=dict)
    timeline: List[Dict[str, Any]] = Field(default_factory=list)

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
    recurrence: str  # Kept for backward compatibility
    trend: str = Field(default="Stable", description="Trend classification: Rising, Declining, Stable, or Insufficient Data")
    timeline: List[Dict[str, Any]] = Field(default_factory=list, description="Chronological timeline of claims and sentiments")
    strength: float
    display_status: str = Field(default="established", description="'established' or 'candidate'")
    is_eligible: bool = Field(default=True, description="Whether eligible for main dashboard display")
    eligibility_reason: str = Field(default="", description="Reason for display eligibility status")
    direction: str = Field(default="neutral", description="'positive', 'negative', 'neutral', or 'mixed'")
    priority: str = Field(default="none", description="'critical', 'high', 'medium', 'low', or 'none'")
    positive_significance: str = Field(default="none", description="'significant', 'notable', 'general', or 'none'")
    classification_reason: str = Field(default="", description="Reasoning for narrative direction, priority, or significance")
    impact_indicators: List[str] = Field(default_factory=list, description="Categorical impact signals")

class FinalNarrative(BaseModel):
    narrative_id: str
    topic_id: str = Field(default="")
    topic: str
    narrative: str
    trend: str = Field(default="Stable", description="Rising, Declining, Stable, or Insufficient Data")
    supporting_evidence: NarrativeEvidence
    analysis: NarrativeAnalysis
    intelligence: str
    recommendation: str
    is_new_topic: bool = False
    display_status: str = Field(default="established", description="'established' or 'candidate'")
    is_eligible: bool = Field(default=True, description="Whether eligible for main dashboard display")
    eligibility_reason: str = Field(default="", description="Explanation of display eligibility")
    direction: str = Field(default="neutral", description="'positive', 'negative', 'neutral', or 'mixed'")
    priority: str = Field(default="none", description="'critical', 'high', 'medium', 'low', or 'none'")
    positive_significance: str = Field(default="none", description="'significant', 'notable', 'general', or 'none'")
    classification_reason: str = Field(default="", description="Reasoning for narrative direction, priority, or significance")
    impact_indicators: List[str] = Field(default_factory=list, description="Categorical impact signals")

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
    run_id: Optional[str] = Field(default=None, description="Optional unique identifier for the batch run to enable cancellation")
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
    status: Optional[str] = Field(default="completed", description="Status of the batch: completed or cancelled")
    message: Optional[str] = Field(default=None, description="Optional informational or cancellation message")

class CancelBatchRequest(BaseModel):
    run_id: Optional[str] = Field(default=None, description="Run ID to cancel")
    batch_id: Optional[str] = Field(default=None, description="Batch ID to cancel")

class ProcessCSVResponse(BaseModel):
    filename: str
    total_rows: int
    documents: List[RawDocument]

# ============================================================
# YOUTUBE EXTRACTION
# ============================================================

class YouTubeExtractRequest(BaseModel):
    url: str = Field(..., description="YouTube video URL")
    extract_transcript: bool = Field(default=True, description="Whether to extract video transcript")
    extract_comments: bool = Field(default=False, description="Whether to extract video comments")
    max_comments: int = Field(default=50, description="Maximum number of comments to retrieve")

class YouTubeExtractResponse(BaseModel):
    success: bool = True
    video_id: str
    url: str
    title: str = ""
    author: str = ""
    publication_date: Optional[str] = None
    duration_seconds: Optional[int] = None
    raw_text: str = ""
    detected_language: str = "en"
    language_name: str = "English"
    is_generated: bool = False
    char_count: int = 0
    word_count: int = 0
    estimated_reading_minutes: int = 0
    source: str = "YouTube"
    source_type: str = "YouTube Video"
    transcript: Optional[Dict[str, Any]] = None
    comments: Optional[Dict[str, Any]] = None

# ============================================================
# ON-DEMAND TEXT TRANSLATION
# ============================================================

class TranslateTextRequest(BaseModel):
    text: str = Field(..., description="Text to translate into English")
    source_language: Optional[str] = Field(default=None, description="Optional source language code")

class TranslateTextResponse(BaseModel):
    original_text: str
    translated_text: str
    detected_language: str
    translation_status: str

# ============================================================
# LINKEDIN OPINION CLASSIFICATION (Llama-3.1-8B SLM)
# ============================================================

class LinkedInPostToClassify(BaseModel):
    id: str
    text: str

class LinkedInClassifyRequest(BaseModel):
    organisation_name: str
    aliases: List[str] = Field(default_factory=list)
    posts: List[LinkedInPostToClassify]

class LinkedInPostClassification(BaseModel):
    id: str
    classification: str = "Uncertain"  # "Relevant Opinion" | "News / Announcement" | "Irrelevant" | "Uncertain"
    is_directly_about_organisation: bool = False
    contains_opinion: bool = False
    opinion_type: str = "None"
    reason: str = ""
    requires_manual_inspection: bool = False

class LinkedInClassifyResponse(BaseModel):
    classified_posts: List[LinkedInPostClassification]
