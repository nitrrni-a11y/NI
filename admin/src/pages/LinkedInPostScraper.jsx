import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
  CheckCircle2, AlertCircle, X, ExternalLink, Loader2, ArrowRight,
  ChevronLeft, ChevronRight, Info, RotateCcw
} from 'lucide-react';
import { useEntity } from '../context/EntityContext';

const LinkedinIcon = ({ size = 20, color = 'currentColor' }) => (
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
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

const LinkedInPostScraper = () => {
  const { selectedEntity } = useEntity();
  const navigate = useNavigate();

  const [postUrl, setPostUrl] = useState('');
  const [numComments, setNumComments] = useState(100);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [extractError, setExtractError] = useState(null);

  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState(null);
  const [ingestError, setIngestError] = useState(null);

  const [commentsPage, setCommentsPage] = useState(1);
  const commentsPerPage = 8;

  const handleExtract = async (e) => {
    if (e) e.preventDefault();
    const trimmedUrl = postUrl.trim();
    if (!trimmedUrl) {
      setExtractError('Please enter a valid LinkedIn post URL.');
      return;
    }

    setIsExtracting(true);
    setExtractError(null);
    setIngestResult(null);
    setIngestError(null);
    setCommentsPage(1);

    try {
      const res = await axios.post('/api/scraper/linkedin/extract', {
        url: trimmedUrl,
        numComments
      }, { withCredentials: true });

      setExtractedData(res.data);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to extract LinkedIn post data.';
      setExtractError(msg);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleIngest = async () => {
    if (!extractedData || !extractedData.post) return;
    if (!selectedEntity?.entityId) {
      setIngestError('Please select an entity before ingesting documents.');
      return;
    }

    setIsIngesting(true);
    setIngestError(null);

    try {
      const res = await axios.post('/api/scraper/linkedin/ingest', {
        entityId: selectedEntity.entityId,
        post: extractedData.post,
        comments: extractedData.comments || []
      }, { withCredentials: true });

      setIngestResult(res.data);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to ingest LinkedIn documents.';
      setIngestError(msg);
    } finally {
      setIsIngesting(false);
    }
  };

  const handleReset = () => {
    setPostUrl('');
    setExtractedData(null);
    setExtractError(null);
    setIngestResult(null);
    setIngestError(null);
    setCommentsPage(1);
  };

  return (
    <div style={{ paddingBottom: '50px' }}>
      {/* Header */}
      <div className="flex flex-col mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: 'rgba(10, 102, 194, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a66c2' }}>
            <LinkedinIcon size={24} color="#0a66c2" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              LinkedIn Post Scraper
            </h1>
            <p className="text-secondary" style={{ fontSize: '0.95rem', margin: 0 }}>
              Extract an individual LinkedIn post and its audience comments for <span className="font-semibold text-primary">{selectedEntity?.name || 'Selected Entity'}</span>.
            </p>
          </div>
        </div>
      </div>

      {/* STEP 1: URL Input & Extract Controls */}
      <div className="card shadow-sm mb-6" style={{ borderColor: 'var(--border-color)', background: 'var(--surface-color)' }}>
        <form onSubmit={handleExtract} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
              LinkedIn Post URL *
            </label>
            <div className="flex gap-2">
              <input 
                type="url" 
                placeholder="https://www.linkedin.com/posts/... or https://www.linkedin.com/feed/update/urn:li:activity:..."
                value={postUrl}
                onChange={(e) => {
                  setPostUrl(e.target.value);
                  if (extractError) setExtractError(null);
                }}
                disabled={isExtracting || isIngesting}
                className="form-control"
                style={{ flex: 1, fontSize: '0.875rem' }}
                required
              />
            </div>
            <p className="text-xs text-muted mt-1.5">
              Paste the full permalink to any public LinkedIn post or update. Tracking parameters are automatically stripped.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl border" style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border-color)' }}>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-secondary">
                Max Comments to Fetch
              </div>
              <div className="text-xs text-muted">
                Requests up to 100 comments. Public logged-out scrapers may receive a restricted subset from LinkedIn.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="number"
                min="10"
                max="100"
                step="10"
                value={numComments}
                onChange={(e) => setNumComments(Math.min(100, Math.max(10, Number(e.target.value) || 100)))}
                disabled={isExtracting || isIngesting}
                className="form-control"
                style={{ width: '80px', textAlign: 'center', fontWeight: 600 }}
              />
              <span className="text-xs text-muted">comments</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div>
              {extractedData ? (
                <span className="text-green-600 dark:text-green-400 text-xs font-semibold flex items-center gap-1.5">
                  <CheckCircle2 size={15} /> Extracted post & comments ready for review.
                </span>
              ) : (
                <span className="text-xs text-muted">Review post content and audience comments before adding to database.</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {extractedData && (
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isExtracting || isIngesting}
                  className="btn btn-secondary text-xs flex items-center gap-1.5"
                >
                  <RotateCcw size={13} />
                  <span>Reset / New Post</span>
                </button>
              )}
              <button 
                type="submit" 
                disabled={isExtracting || isIngesting || !postUrl.trim()}
                className="btn font-semibold flex items-center gap-2 shadow-sm"
                style={{
                  background: 'linear-gradient(135deg, #0a66c2 0%, #004182 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.65rem 1.4rem',
                  borderRadius: '8px',
                  cursor: isExtracting ? 'not-allowed' : 'pointer'
                }}
              >
                {isExtracting ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    <span>Extracting from LinkedIn...</span>
                  </>
                ) : (
                  <>
                    <LinkedinIcon size={16} color="#ffffff" />
                    <span>Extract Post & Comments</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Extraction Error */}
        {extractError && (
          <div 
            className="p-4 mt-4 rounded-xl border flex flex-col gap-2"
            style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.25)', color: 'var(--text-primary)' }}
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div className="text-sm font-medium">{extractError}</div>
            </div>
            {extractError.toLowerCase().includes('apify_api_token') && (
              <div className="text-xs text-secondary pl-7">
                <strong>Setup Hint:</strong> Add <code>APIFY_API_TOKEN=your_token_here</code> to <code>backend/.env</code> and restart your backend.
              </div>
            )}
          </div>
        )}
      </div>

      {/* STEP 2: Preview Extracted Content & Ingest */}
      {extractedData && (
        <div className="space-y-6">
          {/* Post Preview Card */}
          <div className="card shadow-sm" style={{ borderColor: 'var(--border-color)', background: 'var(--surface-color)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span 
                  className="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider"
                  style={{ backgroundColor: 'rgba(10, 102, 194, 0.15)', color: '#0a66c2' }}
                >
                  LinkedIn Post
                </span>
                <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  {extractedData.post.author}
                </span>
                {extractedData.post.authorHeadline && (
                  <span className="text-xs text-muted truncate max-w-sm" title={extractedData.post.authorHeadline}>
                    • {extractedData.post.authorHeadline}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted">
                {extractedData.post.publicationDate && (
                  <span>{new Date(extractedData.post.publicationDate).toLocaleDateString()}</span>
                )}
                <a 
                  href={extractedData.post.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline flex items-center gap-1 font-medium"
                >
                  <span>Open LinkedIn Post</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>

            <div 
              className="p-4 rounded-xl text-sm leading-relaxed border mb-3"
              style={{ 
                backgroundColor: 'var(--bg-color)', 
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
                maxHeight: '240px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap'
              }}
            >
              {extractedData.post.rawText || '(No text content in post)'}
            </div>

            <div className="flex flex-wrap gap-4 text-xs text-secondary pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <span><strong>Reactions:</strong> {extractedData.post.likesCount || 0}</span>
              <span><strong>Comments on LinkedIn:</strong> {extractedData.post.commentsCount || 0}</span>
              <span><strong>Reposts:</strong> {extractedData.post.repostsCount || 0}</span>
            </div>
          </div>

          {/* Comments Metrics Summary Banner */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card shadow-sm text-center p-3.5" style={{ borderColor: 'var(--border-color)' }}>
              <div className="text-xs text-muted uppercase font-semibold">Total Retrieved</div>
              <div className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
                {extractedData.metrics.totalRetrieved}
              </div>
            </div>
            <div className="card shadow-sm text-center p-3.5" style={{ backgroundColor: 'rgba(34, 197, 94, 0.08)', borderColor: 'rgba(34, 197, 94, 0.25)' }}>
              <div className="text-xs text-green-600 dark:text-green-400 uppercase font-semibold">Retained Cleaned</div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                {extractedData.metrics.totalRetained}
              </div>
            </div>
            <div className="card shadow-sm text-center p-3.5" style={{ borderColor: 'var(--border-color)' }}>
              <div className="text-xs text-muted uppercase font-semibold">Noise Filtered</div>
              <div className="text-2xl font-bold text-secondary mt-1" title={`Empty: ${extractedData.metrics.filteredBreakdown.empty}, URLs only: ${extractedData.metrics.filteredBreakdown.urls_only}, Fluff: ${extractedData.metrics.filteredBreakdown.engagement_fluff}, Duplicates: ${extractedData.metrics.filteredBreakdown.duplicate}`}>
                {extractedData.metrics.filteredCount}
              </div>
            </div>
            <div className="card shadow-sm text-center p-3.5" style={{ borderColor: 'var(--border-color)' }}>
              <div className="text-xs text-muted uppercase font-semibold">Depth Status</div>
              <div className="text-xs font-semibold mt-2" style={{ color: extractedData.metrics.isTruncated ? '#eab308' : '#22c55e' }}>
                {extractedData.metrics.isTruncated ? 'Partial (Logged-Out)' : 'All Available'}
              </div>
            </div>
          </div>

          {/* Truncation notice */}
          {extractedData.metrics.truncationNotice && (
            <div 
              className="p-3.5 rounded-xl border text-xs flex items-start gap-2.5"
              style={{ backgroundColor: 'rgba(234, 179, 8, 0.08)', borderColor: 'rgba(234, 179, 8, 0.25)', color: 'var(--text-primary)' }}
            >
              <Info size={16} className="text-yellow-500 shrink-0 mt-0.5" />
              <div>{extractedData.metrics.truncationNotice}</div>
            </div>
          )}

          {/* Cleaned Comments List */}
          <div className="card shadow-sm" style={{ borderColor: 'var(--border-color)', background: 'var(--surface-color)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold m-0" style={{ color: 'var(--text-primary)' }}>
                Cleaned Comments ({extractedData.comments.length})
              </h3>
              {extractedData.comments.length > commentsPerPage && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted">
                    Page {commentsPage} of {Math.ceil(extractedData.comments.length / commentsPerPage)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCommentsPage(p => Math.max(1, p - 1))}
                    disabled={commentsPage === 1}
                    className="btn btn-secondary py-1 px-2.5 text-xs"
                    style={{ height: '30px' }}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCommentsPage(p => Math.min(Math.ceil(extractedData.comments.length / commentsPerPage), p + 1))}
                    disabled={commentsPage >= Math.ceil(extractedData.comments.length / commentsPerPage)}
                    className="btn btn-secondary py-1 px-2.5 text-xs"
                    style={{ height: '30px' }}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>

            {extractedData.comments.length === 0 ? (
              <div className="p-6 rounded-xl text-center border text-xs text-muted" style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border-color)' }}>
                No audience comments available or all comments were filtered as engagement fluff (#CFBR/empty).
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {extractedData.comments
                  .slice((commentsPage - 1) * commentsPerPage, commentsPage * commentsPerPage)
                  .map((c, idx) => (
                    <div 
                      key={c.id || idx}
                      className="p-3.5 rounded-xl border text-xs flex flex-col gap-2"
                      style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border-color)' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                            {c.author}
                          </span>
                          {c.isReply && (
                            <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[10px] font-semibold">
                              Reply {c.parentAuthor ? `to @${c.parentAuthor}` : ''}
                            </span>
                          )}
                          {c.authorHeadline && (
                            <span className="text-muted truncate max-w-sm hidden sm:inline" title={c.authorHeadline}>
                              • {c.authorHeadline}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-muted">
                          {c.likesCount > 0 && <span>👍 {c.likesCount}</span>}
                          {c.publicationDate && <span>{new Date(c.publicationDate).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      <div className="leading-relaxed" style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                        {c.rawText}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Ingestion Results Banner */}
          {ingestResult && (
            <div 
              className="p-4 rounded-xl border flex flex-col gap-3"
              style={{ backgroundColor: 'rgba(34, 197, 94, 0.08)', borderColor: 'rgba(34, 197, 94, 0.25)', color: 'var(--text-primary)' }}
            >
              <div className="flex items-start gap-2.5">
                <CheckCircle2 size={20} className="text-green-500 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-green-600 dark:text-green-400">
                    {ingestResult.message}
                  </div>
                  {ingestResult.batchId && (
                    <div className="text-xs text-muted mt-1 font-mono">
                      Batch ID: {ingestResult.batchId}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 pl-7 pt-1">
                <button
                  type="button"
                  onClick={() => navigate(`/entity/${selectedEntity?.entityId}/data`)}
                  className="btn btn-secondary text-xs"
                >
                  View In Documents Table
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/entity/${selectedEntity?.entityId}/processing`)}
                  className="btn btn-primary text-xs flex items-center gap-1.5"
                >
                  <span>Proceed to AI Processing</span>
                  <ArrowRight size={13} />
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="btn btn-ghost text-xs"
                >
                  Scrape Another Post
                </button>
              </div>
            </div>
          )}

          {/* Ingestion Error Alert */}
          {ingestError && (
            <div 
              className="p-4 rounded-xl border text-sm flex items-start gap-2.5"
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.25)', color: 'var(--text-primary)' }}
            >
              <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div>{ingestError}</div>
            </div>
          )}

          {/* Bottom Actions Bar */}
          {!ingestResult && (
            <div className="flex items-center justify-between p-4 rounded-xl border" style={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)' }}>
              <span className="text-xs text-muted">
                Creates 1 post document + {extractedData.comments.length} comment document(s) in MongoDB with status READY.
              </span>
              <button
                type="button"
                onClick={handleIngest}
                disabled={isIngesting}
                className="btn font-semibold flex items-center gap-2 shadow-sm"
                style={{
                  background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.8rem 1.8rem',
                  borderRadius: '8px',
                  cursor: isIngesting ? 'not-allowed' : 'pointer'
                }}
              >
                {isIngesting ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    <span>Saving Documents to MongoDB...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Add as Documents (1 Post + {extractedData.comments.length} Comments)</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LinkedInPostScraper;

