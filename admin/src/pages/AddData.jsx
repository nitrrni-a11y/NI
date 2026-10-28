import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, Loader2, CheckCircle2, 
  AlertCircle, Globe, Clock, Video, ArrowRight, RotateCcw
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
  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState('');
  const [extractedData, setExtractedData] = useState(null);

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

    setExtracting(true);
    setExtractionError('');
    setSaveError('');
    setSaveSuccess(false);

    try {
      const response = await axios.post(
        '/api/documents/youtube/extract',
        { url: trimmedUrl },
        { withCredentials: true }
      );

      const data = response.data;
      setExtractedData(data);
      setYtFormData({
        title: data.title || '',
        rawText: data.raw_text || '',
        source: 'YouTube',
        sourceType: 'YouTube Video',
        url: data.url || trimmedUrl,
        author: data.author || '',
        publicationDate: data.publication_date || ''
      });
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to extract transcript from YouTube video.';
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
    if (!ytFormData.rawText || !ytFormData.rawText.trim()) {
      setSaveError('Transcript cannot be empty. Please provide transcript text.');
      return;
    }
    if (!selectedEntity?.entityId) {
      setSaveError('No active entity selected. Please select an entity first.');
      return;
    }

    setSavingYt(true);
    setSaveError('');

    try {
      await axios.post(
        '/api/documents',
        {
          title: ytFormData.title.trim() || 'YouTube Video Transcript',
          rawText: ytFormData.rawText.trim(),
          source: 'YouTube',
          sourceType: 'YouTube Video',
          url: ytFormData.url.trim(),
          author: ytFormData.author.trim() || 'Unknown',
          publicationDate: ytFormData.publicationDate || null,
          entity_id: selectedEntity?.entityId
        },
        { withCredentials: true }
      );

      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err.response?.data?.message || 'Failed to save YouTube document to database.');
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
          <span>YouTube Transcript</span>
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
      {/* MODE 2: YOUTUBE TRANSCRIPT INGESTION WORKFLOW             */}
      {/* ======================================================== */}
      {ingestionMode === 'youtube' && (
        <div className="space-y-6">
          {/* STEP 1 CARD: Enter YouTube URL */}
          <div className="card add-data-card">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="badge-auto" style={{ marginLeft: 0 }}>Step 1</span>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Enter YouTube Video URL
                </h2>
              </div>
              <p className="text-muted text-sm">
                Provide a YouTube video, shorts, or live stream link. Captions and metadata will be extracted automatically.
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
                    disabled={extracting || !youtubeUrl.trim()}
                  >
                    {extracting ? (
                      <>
                        <Loader2 size={16} className="spin" />
                        <span>Extracting Transcript...</span>
                      </>
                    ) : (
                      <>
                        <YoutubeIcon size={18} />
                        <span>Extract Transcript</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-muted text-xs mt-2">
                  Supports standard watch links, youtu.be, /shorts/, and /live/ streams.
                </p>
              </div>
            </form>
          </div>

          {/* STEP 2 & 3: REVIEW, EDIT & SAVE (Shown only after extraction succeeds) */}
          {extractedData && (
            <div className="card add-data-card" style={{ marginTop: '1.5rem' }}>
              {/* Step 2 Header */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="badge-auto" style={{ marginLeft: 0, background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-green)' }}>
                    Step 2 & 3
                  </span>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Review, Edit & Confirm
                  </h2>
                </div>
                <p className="text-muted text-sm">
                  Review the extracted metadata and transcript below. You can edit any field before adding the document to MongoDB.
                </p>
              </div>

              {/* Extraction Stats Banner */}
              <div className="youtube-meta-bar">
                <span className="meta-pill">
                  <Globe size={14} />
                  <span>Language: {extractedData.language_name || extractedData.detected_language}</span>
                </span>
                <span className="meta-pill">
                  <FileText size={14} />
                  <span>{ytFormData.rawText.length.toLocaleString()} characters</span>
                </span>
                <span className="meta-pill">
                  <Clock size={14} />
                  <span>~{readingTimeEstimate(ytFormData.rawText)} min read</span>
                </span>
                {extractedData.duration_seconds && (
                  <span className="meta-pill">
                    <Video size={14} />
                    <span>Video length: {formatDuration(extractedData.duration_seconds)}</span>
                  </span>
                )}
                {extractedData.is_generated && (
                  <span className="meta-pill" style={{ borderColor: 'rgba(245, 158, 11, 0.3)', color: 'var(--accent-orange)' }}>
                    Auto-generated Captions
                  </span>
                )}
              </div>

              {/* Success Notification */}
              {saveSuccess && (
                <div className="p-4 mb-6 rounded" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--status-success)', fontWeight: 600, fontSize: '1.05rem' }}>
                    <CheckCircle2 size={20} />
                    <span>Document successfully saved to database!</span>
                  </div>
                  <p className="text-secondary text-sm mb-4">
                    The YouTube transcript is now stored and ready for AI claim extraction, grouping, and narrative intelligence processing.
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

              {/* Save Error Alert */}
              {saveError && (
                <div className="p-3 mb-4 rounded border-error text-error bg-opacity-10 flex items-start gap-2">
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>{saveError}</span>
                </div>
              )}

              {/* Review & Edit Form */}
              {!saveSuccess && (
                <form onSubmit={handleSaveYouTubeDoc} className="add-data-form">
                  {/* Fixed Source Information */}
                  <div className="form-group add-data-field">
                    <label className="form-label">
                      Source / Provider
                      <span className="badge-auto">System Fixed</span>
                    </label>
                    <input
                      type="text"
                      name="source"
                      className="form-control add-data-control"
                      value={ytFormData.source}
                      readOnly
                      style={{ background: 'var(--surface-color-soft)', cursor: 'not-allowed' }}
                    />
                  </div>

                  <div className="form-group add-data-field">
                    <label className="form-label">
                      Source Type
                      <span className="badge-auto">System Fixed</span>
                    </label>
                    <input
                      type="text"
                      name="sourceType"
                      className="form-control add-data-control"
                      value={ytFormData.sourceType}
                      readOnly
                      style={{ background: 'var(--surface-color-soft)', cursor: 'not-allowed' }}
                    />
                  </div>

                  {/* Editable Title */}
                  <div className="form-group add-data-field add-data-field-full">
                    <label className="form-label">
                      Title / Headline
                      <span className="badge-auto" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-green)' }}>Editable</span>
                    </label>
                    <input
                      type="text"
                      name="title"
                      className="form-control add-data-control"
                      value={ytFormData.title}
                      onChange={handleYtFormChange}
                      placeholder="Extracted video title (editable)"
                    />
                  </div>

                  {/* Editable Channel / Author */}
                  <div className="form-group add-data-field">
                    <label className="form-label">
                      Channel / Author
                      <span className="badge-auto" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-green)' }}>Editable</span>
                    </label>
                    <input
                      type="text"
                      name="author"
                      className="form-control add-data-control"
                      value={ytFormData.author}
                      onChange={handleYtFormChange}
                      placeholder="Channel or speaker name"
                    />
                    <p className="text-muted text-xs mt-1">Note: Channel name is not necessarily the speaking author.</p>
                  </div>

                  {/* Editable Publication Date */}
                  <div className="form-group add-data-field">
                    <label className="form-label">
                      Publication Date
                      <span className="badge-auto" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-green)' }}>Editable</span>
                    </label>
                    <input
                      type="date"
                      name="publicationDate"
                      className="form-control add-data-control"
                      value={ytFormData.publicationDate}
                      onChange={handleYtFormChange}
                    />
                  </div>

                  {/* Video URL */}
                  <div className="form-group add-data-field add-data-field-full">
                    <label className="form-label">Original Video URL</label>
                    <input
                      type="url"
                      name="url"
                      className="form-control add-data-control"
                      value={ytFormData.url}
                      onChange={handleYtFormChange}
                    />
                  </div>

                  {/* Editable Full Transcript Preview */}
                  <div className="form-group add-data-field add-data-field-full">
                    <div className="flex justify-between items-center mb-1">
                      <label className="form-label" style={{ marginBottom: 0 }}>
                        Full Transcript (Editable) *
                      </label>
                      <span className="text-muted text-xs">
                        {ytFormData.rawText.length.toLocaleString()} characters
                      </span>
                    </div>
                    <p className="text-muted text-xs mb-2">
                      Original text in {extractedData.language_name || extractedData.detected_language}. Unaltered Unicode Indic and Latin scripts are fully preserved. You may review and edit the transcript directly before adding it to the database.
                    </p>
                    <textarea
                      name="rawText"
                      className="form-control add-data-control youtube-transcript-textarea"
                      value={ytFormData.rawText}
                      onChange={handleYtFormChange}
                      required
                      placeholder="Transcript text..."
                    />
                  </div>

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
                        disabled={savingYt || !ytFormData.rawText.trim()}
                        style={{ minWidth: '150px' }}
                      >
                        {savingYt ? (
                          <>
                            <Loader2 size={16} className="spin" />
                            <span>Adding to DB...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={16} />
                            <span>Add Document</span>
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
