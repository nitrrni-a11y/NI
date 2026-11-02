import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, Loader2, CheckCircle2, 
  AlertCircle, Globe, Clock, Video, ArrowRight, RotateCcw,
  MessageSquare, ThumbsUp, CheckSquare, Square, Info, ExternalLink
} from 'lucide-react';
import { useEntity } from '../context/EntityContext';

const YoutubeIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
    <polygon points="10 15 15 12 10 9 10 15" fill={color} />
  </svg>
);

const AddData = () => {
  const navigate = useNavigate();
  const { selectedEntity } = useEntity();

  // Ingestion Mode: 'manual' | 'youtube'
  const [ingestionMode, setIngestionMode] = useState('manual');

  // --- MANUAL FORM STATE ---
  const [manualFormData, setManualFormData] = useState({
    title: '',
    rawText: '',
    source: '',
    sourceType: 'News',
    url: '',
    author: '',
    publicationDate: ''
  });
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState('');

  // --- YOUTUBE FORM STATE ---
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [extractTranscript, setExtractTranscript] = useState(true);
  const [extractComments, setExtractComments] = useState(false);
  const [maxComments, setMaxComments] = useState(50);
  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState('');
  const [extractedData, setExtractedData] = useState(null);

  const [includeTranscriptInSave, setIncludeTranscriptInSave] = useState(true);
  const [includeCommentsInSave, setIncludeCommentsInSave] = useState(true);

  const [ytFormData, setYtFormData] = useState({
    title: '',
    rawText: '',
    source: 'YouTube',
    sourceType: 'YouTube Video',
    url: '',
    author: '',
    publicationDate: ''
  });
  const [savingYt, setSavingYt] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [ingestionSummary, setIngestionSummary] = useState(null);

  // --- MANUAL HANDLERS ---
  const handleManualChange = (e) => {
    setManualFormData({ ...manualFormData, [e.target.name]: e.target.value });
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    setManualLoading(true);
    setManualError('');

    try {
      await axios.post(
        '/api/documents', 
        { ...manualFormData, entity_id: selectedEntity?.entityId },
        { withCredentials: true }
      );
      navigate(`/entity/${selectedEntity?.entityId}/data`);
    } catch (err) {
      setManualError(err.response?.data?.message || 'Failed to add document');
      setManualLoading(false);
    }
  };

  // --- YOUTUBE HANDLERS ---
  const handleExtractYouTube = async (e) => {
    if (e) e.preventDefault();
    const trimmedUrl = youtubeUrl.trim();
    if (!trimmedUrl) {
      setExtractionError('Please enter a valid YouTube video URL.');
      return;
    }

    // Supported YouTube URL regex validation
    const ytRegex = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
    if (!ytRegex.test(trimmedUrl)) {
      setExtractionError('Invalid YouTube URL. Please provide a valid link (e.g., https://www.youtube.com/watch?v=... or https://youtu.be/...).');
      return;
    }

    if (!extractTranscript && !extractComments) {
      setExtractionError('Please select at least one extraction option: Video Transcript, Video Comments, or both.');
      return;
    }

    setExtracting(true);
    setExtractionError('');
    setSaveError('');
    setSaveSuccess(false);
    setIngestionSummary(null);

    try {
      const response = await axios.post(
        '/api/documents/youtube/extract',
        { 
          url: trimmedUrl,
          extractTranscript,
          extractComments,
          maxComments: Number(maxComments) || 50
        },
        { withCredentials: true }
      );

      const data = response.data;
      setExtractedData(data);
      setIncludeTranscriptInSave(Boolean(data.transcript?.success));
      setIncludeCommentsInSave(Boolean(data.comments?.success && data.comments?.count > 0));

      setYtFormData({
        title: data.title || '',
        rawText: data.transcript?.raw_text || data.raw_text || '',
        source: 'YouTube',
        sourceType: 'YouTube Video',
        url: data.url || trimmedUrl,
        author: data.author || '',
        publicationDate: data.publication_date || ''
      });
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to extract selected YouTube data.';
      setExtractionError(errMsg);
      setExtractedData(null);
    } finally {
      setExtracting(false);
    }
  };

  const handleYtFormChange = (e) => {
    setYtFormData({ ...ytFormData, [e.target.name]: e.target.value });
  };

  const handleSaveYouTubeDoc = async (e) => {
    e.preventDefault();
    if (!selectedEntity?.entityId) {
      setSaveError('No active entity selected. Please select an entity first.');
      return;
    }

    const hasTranscriptToSave = includeTranscriptInSave && ytFormData.rawText && ytFormData.rawText.trim();
    const hasCommentsToSave = includeCommentsInSave && extractedData?.comments?.comments?.length > 0;

    if (!hasTranscriptToSave && !hasCommentsToSave) {
      setSaveError('Please select at least one successfully extracted item (Transcript or Comments) to add to database.');
      return;
    }

    setSavingYt(true);
    setSaveError('');

    try {
      const response = await axios.post(
        '/api/documents/youtube/ingest',
        {
          entityId: selectedEntity.entityId,
          videoId: extractedData.video_id,
          videoUrl: ytFormData.url || extractedData.url,
          videoTitle: ytFormData.title,
          videoAuthor: ytFormData.author,
          videoPublicationDate: ytFormData.publicationDate,
          transcript: {
            include: Boolean(hasTranscriptToSave),
            title: ytFormData.title.trim() || 'YouTube Video Transcript',
            rawText: ytFormData.rawText.trim(),
            author: ytFormData.author.trim() || 'Unknown',
            publicationDate: ytFormData.publicationDate || null
          },
          comments: {
            include: Boolean(hasCommentsToSave),
            items: extractedData?.comments?.comments || []
          }
        },
        { withCredentials: true }
      );

      setSaveSuccess(true);
      setIngestionSummary(response.data);
    } catch (err) {
      setSaveError(err.response?.data?.message || err.message || 'Failed to save YouTube data to database.');
    } finally {
      setSavingYt(false);
    }
  };

  const handleResetYouTube = () => {
    setYoutubeUrl('');
    setExtractedData(null);
    setExtractionError('');
    setSaveError('');
    setSaveSuccess(false);
    setIngestionSummary(null);
    setYtFormData({
      title: '',
      rawText: '',
      source: 'YouTube',
      sourceType: 'YouTube Video',
      url: '',
      author: '',
      publicationDate: ''
    });
  };

  const formatDuration = (seconds) => {
    if (!seconds || isNaN(seconds)) return null;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  const readingTimeEstimate = (text) => {
    if (!text) return 1;
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
  };

  return (
    <div className="add-data-page">
      {/* Header */}
      <div className="flex flex-col mb-6">
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          Add Data
        </h1>
        <p className="text-secondary" style={{ fontSize: '1.05rem' }}>
          Ingest raw content into the Narrative Intelligence processing pipeline.
        </p>
      </div>

      {/* Ingestion Mode Switcher */}
      <div className="ingestion-tabs">
        <button
          type="button"
          className={`ingestion-tab ${ingestionMode === 'manual' ? 'active' : ''}`}
          onClick={() => {
            setIngestionMode('manual');
            setExtractionError('');
            setSaveError('');
          }}
        >
          <FileText size={18} />
          <span>Manual Document</span>
        </button>
        <button
          type="button"
          className={`ingestion-tab ${ingestionMode === 'youtube' ? 'active' : ''}`}
          onClick={() => {
            setIngestionMode('youtube');
            setManualError('');
          }}
        >
          <YoutubeIcon size={18} />
          <span>YouTube Data</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* MODE 1: MANUAL DOCUMENT FORM (Preserved Unchanged)        */}
      {/* ======================================================== */}
      {ingestionMode === 'manual' && (
        <div className="card add-data-card">
          <div className="mb-4">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              Manual Document Entry
            </h2>
            <p className="text-muted text-sm">
              Enter article, press release, or document text directly.
            </p>
          </div>

          {manualError && (
            <div className="p-3 mb-4 rounded border-error text-error bg-opacity-10 flex items-center gap-2">
              <AlertCircle size={18} />
              <span>{manualError}</span>
            </div>
          )}

          <form onSubmit={handleManualSubmit} className="add-data-form">
            <div className="form-group add-data-field add-data-field-full">
              <label className="form-label">Source / Provider *</label>
              <input 
                type="text" 
                name="source" 
                className="form-control add-data-control" 
                value={manualFormData.source} 
                onChange={handleManualChange} 
                placeholder="e.g., Reuters, Subreddit Name, YouTube Channel"
                required 
              />
            </div>

            <div className="add-data-grid add-data-field-full" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
              <div className="form-group add-data-field">
                <label className="form-label">Source Type</label>
                <select name="sourceType" className="form-control add-data-control" value={manualFormData.sourceType} onChange={handleManualChange}>
                  <option value="News">News Article</option>
                  <option value="SocialMedia">Social Media Post</option>
                  <option value="VideoTranscript">Video Transcript</option>
                  <option value="Report">Intelligence Report</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              
              <div className="form-group add-data-field">
                <label className="form-label">Publication Date</label>
                <input 
                  type="date" 
                  name="publicationDate" 
                  className="form-control add-data-control" 
                  value={manualFormData.publicationDate} 
                  onChange={handleManualChange} 
                />
              </div>
            </div>

            <div className="form-group add-data-field">
              <label className="form-label">Title / Headline</label>
              <input 
                type="text" 
                name="title" 
                className="form-control add-data-control" 
                value={manualFormData.title} 
                onChange={handleManualChange} 
                placeholder="Optional if social media"
              />
            </div>

            <div className="form-group add-data-field">
              <label className="form-label">Author</label>
              <input 
                type="text" 
                name="author" 
                className="form-control add-data-control" 
                value={manualFormData.author} 
                onChange={handleManualChange} 
                placeholder="Author or publisher name"
              />
            </div>

            <div className="form-group add-data-field add-data-field-full">
              <label className="form-label">Original URL</label>
              <input 
                type="url" 
                name="url" 
                className="form-control add-data-control" 
                value={manualFormData.url} 
                onChange={handleManualChange} 
              />
            </div>

            <div className="form-group add-data-field add-data-field-full">
              <label className="form-label">Raw Text *</label>
              <p className="text-muted text-xs mb-2">Provide the exact, unedited raw text. The AI pipeline will handle cleaning and normalization.</p>
              <textarea 
                name="rawText" 
                className="form-control add-data-control add-data-textarea" 
                value={manualFormData.rawText} 
                onChange={handleManualChange} 
                required 
              />
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t" style={{ borderColor: 'var(--border-color)', width: '100%' }}>
              <button type="button" className="btn btn-secondary" onClick={() => navigate(`/entity/${selectedEntity?.entityId}/data`)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={manualLoading}>
                {manualLoading ? 'Ingesting...' : 'Add to Database'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODE 2: YOUTUBE DATA INGESTION WORKFLOW                  */}
      {/* ======================================================== */}
      {ingestionMode === 'youtube' && (
        <div className="space-y-6">
          {/* STEP 1 CARD: Enter YouTube URL & Select Extraction Type */}
          <div className="card add-data-card">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="badge-auto" style={{ marginLeft: 0 }}>Step 1</span>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Enter YouTube Video URL & Select Data
                </h2>
              </div>
              <p className="text-muted text-sm">
                Provide a YouTube video, shorts, or live stream link. Choose whether to extract video transcript captions, viewer comments, or both.
              </p>
            </div>

            {extractionError && (
              <div className="p-3 mb-4 rounded border-error text-error bg-opacity-10 flex items-start gap-2">
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{extractionError}</span>
              </div>
            )}

            <form onSubmit={handleExtractYouTube}>
              <div className="form-group add-data-field add-data-field-full">
                <label className="form-label">YouTube Video URL *</label>
                <div className="youtube-input-row">
                  <input
                    type="url"
                    className="form-control add-data-control"
                    placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                    value={youtubeUrl}
                    onChange={(e) => {
                      setYoutubeUrl(e.target.value);
                      setExtractionError('');
                    }}
                    disabled={extracting}
                    required
                  />
                  <button
                    type="submit"
                    className="btn btn-primary extract-btn"
                    disabled={extracting || !youtubeUrl.trim() || (!extractTranscript && !extractComments)}
                  >
                    {extracting ? (
                      <>
                        <Loader2 size={16} className="spin" />
                        <span>Extracting Data...</span>
                      </>
                    ) : (
                      <>
                        <YoutubeIcon size={18} />
                        <span>Extract Selected Data</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-muted text-xs mt-2">
                  Supports standard watch links, youtu.be, /shorts/, and /live/ streams.
                </p>
              </div>

              {/* WHAT WOULD YOU LIKE TO EXTRACT? SELECTION CARDS */}
              <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: '0.25rem' }}>
                  What would you like to extract?
                </label>
                <p className="text-muted text-xs mb-3">
                  Select one or both options to extract video captions and/or viewer comments.
                </p>

                <div className="yt-options-grid">
                  {/* OPTION 1: VIDEO TRANSCRIPT */}
                  <div 
                    className={`yt-option-card ${extractTranscript ? 'selected' : ''}`}
                    onClick={() => {
                      if (!extracting) {
                        setExtractTranscript(!extractTranscript);
                        setExtractionError('');
                      }
                    }}
                  >
                    <input 
                      type="checkbox"
                      className="yt-option-checkbox"
                      checked={extractTranscript}
                      onChange={() => {}}
                      disabled={extracting}
                    />
                    <div className="yt-option-content">
                      <div className="yt-option-title">
                        <FileText size={17} className="text-blue-500" />
                        <span>Video Transcript</span>
                      </div>
                      <p className="yt-option-desc">
                        Extract available captions/transcript from the YouTube video. Preserves multilingual scripts and exact wording.
                      </p>
                    </div>
                  </div>

                  {/* OPTION 2: VIDEO COMMENTS */}
                  <div 
                    className={`yt-option-card ${extractComments ? 'selected' : ''}`}
                    onClick={() => {
                      if (!extracting) {
                        setExtractComments(!extractComments);
                        setExtractionError('');
                      }
                    }}
                  >
                    <input 
                      type="checkbox"
                      className="yt-option-checkbox"
                      checked={extractComments}
                      onChange={() => {}}
                      disabled={extracting}
                    />
                    <div className="yt-option-content">
                      <div className="yt-option-title">
                        <MessageSquare size={17} className="text-indigo-500" />
                        <span>Video Comments</span>
                      </div>
                      <p className="yt-option-desc">
                        Extract comments posted by viewers on the YouTube video. Includes author, comment text, published date, and like count.
                      </p>
                    </div>
                  </div>
                </div>

                {/* MAX COMMENTS PICKER IF COMMENTS IS SELECTED */}
                {extractComments && (
                  <div className="mt-3.5 p-3 rounded-lg flex items-center justify-between flex-wrap gap-3" style={{ background: 'var(--surface-color-soft)', border: '1px solid var(--border-color)' }}>
                    <div className="flex items-center gap-2">
                      <Info size={15} className="text-blue-500" />
                      <span className="text-xs text-secondary font-medium">Maximum comments to retrieve:</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {[20, 50, 100].map((num) => (
                        <button
                          key={num}
                          type="button"
                          className={`btn btn-sm ${maxComments === num ? 'btn-primary' : 'btn-secondary'} text-xs py-1 px-2.5`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMaxComments(num);
                          }}
                          disabled={extracting}
                        >
                          {num} comments
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </form>
          </div>

          {/* STEP 2 & 3: REVIEW, EDIT & INGEST */}
          {extractedData && (
            <div className="card add-data-card" style={{ marginTop: '1.5rem' }}>
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="badge-auto" style={{ marginLeft: 0, background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-green)' }}>
                    Step 2 & 3
                  </span>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Review Extracted YouTube Data & Ingest
                  </h2>
                </div>
                <p className="text-muted text-sm">
                  Review the extracted video metadata, transcript, and comments below before ingesting into Narrative Intelligence.
                </p>
              </div>

              {/* VIDEO METADATA BAR (Always Shown Once) */}
              <div className="youtube-meta-bar">
                {extractedData.title && (
                  <span className="meta-pill" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    <span>{extractedData.title}</span>
                  </span>
                )}
                {extractedData.author && (
                  <span className="meta-pill">
                    <span>Channel: {extractedData.author}</span>
                  </span>
                )}
                {extractedData.publication_date && (
                  <span className="meta-pill">
                    <Clock size={14} />
                    <span>Published: {extractedData.publication_date}</span>
                  </span>
                )}
                {extractedData.duration_seconds && (
                  <span className="meta-pill">
                    <Video size={14} />
                    <span>Duration: {formatDuration(extractedData.duration_seconds)}</span>
                  </span>
                )}
                <span className="meta-pill">
                  <span>ID: {extractedData.video_id}</span>
                </span>
                {extractedData.url && (
                  <a 
                    href={extractedData.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="meta-pill hover:underline flex items-center gap-1"
                    style={{ color: 'var(--accent-blue)' }}
                  >
                    <span>View Video</span>
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>

              {/* SUCCESS NOTIFICATION */}
              {saveSuccess && (
                <div className="p-4 mb-6 rounded" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--status-success)', fontWeight: 600, fontSize: '1.05rem' }}>
                    <CheckCircle2 size={20} />
                    <span>{ingestionSummary?.message || 'YouTube data successfully ingested into database!'}</span>
                  </div>
                  <p className="text-secondary text-sm mb-4">
                    The extracted documents are now stored in MongoDB with ProcessingJob created, ready for AI claim extraction and narrative intelligence analysis.
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => navigate(`/entity/${selectedEntity?.entityId}/data`)}
                    >
                      <span>View in Data Management</span>
                      <ArrowRight size={16} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleResetYouTube}
                    >
                      <RotateCcw size={16} />
                      <span>Extract Another Video</span>
                    </button>
                  </div>
                </div>
              )}

              {/* SAVE ERROR ALERT */}
              {saveError && (
                <div className="p-3 mb-4 rounded border-error text-error bg-opacity-10 flex items-start gap-2">
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>{saveError}</span>
                </div>
              )}

              {!saveSuccess && (
                <form onSubmit={handleSaveYouTubeDoc} className="space-y-6">
                  {/* ======================================================== */}
                  {/* SECTION A: TRANSCRIPT RESULTS (If requested)             */}
                  {/* ======================================================== */}
                  {extractedData.transcript && (
                    <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border-color)', background: 'var(--surface-color)' }}>
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                        <div className="flex items-center gap-2.5">
                          <FileText size={18} className="text-blue-500" />
                          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                            Video Transcript Results
                          </h3>
                          {extractedData.transcript.success ? (
                            <span className="badge-auto" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-green)' }}>
                              Extracted Successfully
                            </span>
                          ) : (
                            <span className="badge-auto" style={{ background: 'rgba(239, 68, 68, 0.15)', color: 'var(--status-error)' }}>
                              Extraction Failed
                            </span>
                          )}
                        </div>

                        {extractedData.transcript.success && (
                          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                            <input
                              type="checkbox"
                              checked={includeTranscriptInSave}
                              onChange={(e) => setIncludeTranscriptInSave(e.target.checked)}
                              className="yt-option-checkbox"
                            />
                            <span>Include Transcript in Ingestion</span>
                          </label>
                        )}
                      </div>

                      {extractedData.transcript.success ? (
                        <>
                          <div className="flex flex-wrap gap-2 mb-3">
                            <span className="meta-pill text-xs">
                              <Globe size={13} />
                              <span>Language: {extractedData.transcript.language_name || extractedData.transcript.detected_language}</span>
                            </span>
                            <span className="meta-pill text-xs">
                              <FileText size={13} />
                              <span>{ytFormData.rawText.length.toLocaleString()} characters ({extractedData.transcript.word_count || 0} words)</span>
                            </span>
                            <span className="meta-pill text-xs">
                              <Clock size={13} />
                              <span>~{readingTimeEstimate(ytFormData.rawText)} min read</span>
                            </span>
                            {extractedData.transcript.is_generated && (
                              <span className="meta-pill text-xs" style={{ borderColor: 'rgba(245, 158, 11, 0.3)', color: 'var(--accent-orange)' }}>
                                Auto-generated Captions
                              </span>
                            )}
                          </div>

                          {/* Editable fields */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                            <div className="form-group add-data-field">
                              <label className="form-label text-xs">Headline / Title (Editable)</label>
                              <input
                                type="text"
                                name="title"
                                className="form-control add-data-control text-sm"
                                value={ytFormData.title}
                                onChange={handleYtFormChange}
                              />
                            </div>
                            <div className="form-group add-data-field">
                              <label className="form-label text-xs">Channel / Author</label>
                              <input
                                type="text"
                                name="author"
                                className="form-control add-data-control text-sm"
                                value={ytFormData.author}
                                onChange={handleYtFormChange}
                              />
                            </div>
                          </div>

                          <div className="form-group add-data-field add-data-field-full">
                            <label className="form-label text-xs">
                              Full Transcript Text (Editable)
                            </label>
                            <textarea
                              name="rawText"
                              className="form-control add-data-control youtube-transcript-textarea"
                              value={ytFormData.rawText}
                              onChange={handleYtFormChange}
                              placeholder="Transcript text..."
                              style={{ minHeight: '180px' }}
                            />
                          </div>
                        </>
                      ) : (
                        <div className="p-3 rounded border text-sm" style={{ background: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.25)', color: 'var(--text-primary)' }}>
                          <p style={{ margin: 0 }}>
                            {extractedData.transcript.error || 'Captions are disabled or unavailable for this video.'}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ======================================================== */}
                  {/* SECTION B: COMMENT RESULTS (If requested)                */}
                  {/* ======================================================== */}
                  {extractedData.comments && (
                    <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border-color)', background: 'var(--surface-color)' }}>
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                        <div className="flex items-center gap-2.5">
                          <MessageSquare size={18} className="text-indigo-500" />
                          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                            Viewer Comments Results
                          </h3>
                          {extractedData.comments.success && extractedData.comments.count > 0 && (
                            <span className="badge-auto" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-green)' }}>
                              {extractedData.comments.count} Retrieved
                            </span>
                          )}
                          {extractedData.comments.status === 'disabled' && (
                            <span className="badge-auto" style={{ background: 'rgba(107, 114, 128, 0.15)', color: 'var(--text-muted)' }}>
                              Comments Disabled
                            </span>
                          )}
                          {extractedData.comments.status === 'empty' && (
                            <span className="badge-auto" style={{ background: 'rgba(107, 114, 128, 0.15)', color: 'var(--text-muted)' }}>
                              Zero Comments
                            </span>
                          )}
                          {extractedData.comments.status === 'network_error' && (
                            <span className="badge-auto" style={{ background: 'rgba(239, 68, 68, 0.15)', color: 'var(--status-error)' }}>
                              Network Error
                            </span>
                          )}
                          {extractedData.comments.status === 'failed' && (
                            <span className="badge-auto" style={{ background: 'rgba(239, 68, 68, 0.15)', color: 'var(--status-error)' }}>
                              Extraction Failed
                            </span>
                          )}
                        </div>

                        {extractedData.comments.success && extractedData.comments.count > 0 && (
                          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                            <input
                              type="checkbox"
                              checked={includeCommentsInSave}
                              onChange={(e) => setIncludeCommentsInSave(e.target.checked)}
                              className="yt-option-checkbox"
                            />
                            <span>Include {extractedData.comments.count} Comments in Ingestion</span>
                          </label>
                        )}
                      </div>

                      {/* Comment Status Messages */}
                      {extractedData.comments.status === 'disabled' && (
                        <div className="p-3 rounded border text-sm" style={{ background: 'var(--surface-color-soft)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                          <p style={{ margin: 0 }}>
                            Viewer comments are disabled by the video creator or YouTube policy for this video.
                          </p>
                        </div>
                      )}

                      {extractedData.comments.status === 'empty' && (
                        <div className="p-3 rounded border text-sm" style={{ background: 'var(--surface-color-soft)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                          <p style={{ margin: 0 }}>
                            This video currently has no comments posted by viewers.
                          </p>
                        </div>
                      )}

                      {extractedData.comments.status === 'network_error' && (
                        <div className="p-3 rounded border text-sm" style={{ background: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.25)', color: 'var(--text-primary)' }}>
                          <p style={{ margin: 0 }}>
                            {extractedData.comments.error || 'Network error connecting to YouTube. Please check your internet connection.'}
                          </p>
                        </div>
                      )}

                      {extractedData.comments.status === 'failed' && (
                        <div className="p-3 rounded border text-sm" style={{ background: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.25)', color: 'var(--text-primary)' }}>
                          <p style={{ margin: 0 }}>
                            {extractedData.comments.error || 'Failed to retrieve comments from YouTube.'}
                          </p>
                        </div>
                      )}

                      {/* Comments Preview List */}
                      {extractedData.comments.success && extractedData.comments.count > 0 && (
                        <div>
                          <div className="flex items-center justify-between text-xs text-muted mb-2">
                            <span>Showing {extractedData.comments.count} retrieved comments:</span>
                            {extractedData.comments.limitReached && (
                              <span className="text-amber-500 font-medium">
                                Retrieval limit reached ({maxComments} max). Additional comments exist on YouTube.
                              </span>
                            )}
                          </div>

                          <div className="yt-comments-list">
                            {extractedData.comments.comments.map((comment, idx) => (
                              <div key={comment.id || idx} className="yt-comment-card">
                                <div className="yt-comment-header">
                                  <span className="yt-comment-author">{comment.author}</span>
                                  <div className="flex items-center gap-3">
                                    <span className="yt-comment-likes">
                                      <ThumbsUp size={12} />
                                      <span>{comment.likeCount || 0}</span>
                                    </span>
                                    {comment.publishedAt && (
                                      <span className="yt-comment-date">
                                        {new Date(comment.publishedAt).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="yt-comment-text">{comment.text}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="flex justify-between items-center mt-6 pt-4 border-t" style={{ borderColor: 'var(--border-color)', width: '100%' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleResetYouTube}
                      disabled={savingYt}
                    >
                      Clear & Reset
                    </button>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate(`/entity/${selectedEntity?.entityId}/data`)}
                        disabled={savingYt}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={savingYt || (!includeTranscriptInSave && !includeCommentsInSave)}
                        style={{ minWidth: '180px' }}
                      >
                        {savingYt ? (
                          <>
                            <Loader2 size={16} className="spin" />
                            <span>Ingesting to DB...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={16} />
                            <span>Ingest Selected Data</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AddData;
