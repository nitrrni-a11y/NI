import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
  PlaySquare, CheckCircle2, AlertCircle, ExternalLink, Loader2, ArrowRight,
  Filter, CheckSquare, Square, Info, RotateCcw, ThumbsUp, MessageSquare,
  Eye, Clock, Plus, X, FileText, ChevronDown, ChevronUp, Sparkles, AlertTriangle
} from 'lucide-react';
import { useEntity } from '../context/EntityContext';
import SourceDiscoveryTabs from '../components/SourceDiscoveryTabs';

const YouTubeIcon = ({ size = 20, color = 'currentColor' }) => (
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
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill={color} />
  </svg>
);

const YouTubeDiscovery = () => {
  const { selectedEntity } = useEntity();
  const navigate = useNavigate();

  // Search parameters
  const [queries, setQueries] = useState([]);
  const [newQueryInput, setNewQueryInput] = useState('');
  const [limitPerQuery, setLimitPerQuery] = useState(6);
  const [extractTranscripts, setExtractTranscripts] = useState(true);
  const [isGeneratingQueries, setIsGeneratingQueries] = useState(false);

  // Discovery state
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState(null);
  const [discoveryError, setDiscoveryError] = useState(null);

  // Active filter tab: 'all' | 'likely' | 'uncertain' | 'with_transcripts'
  const [activeFilter, setActiveFilter] = useState('likely');

  // Selected videos for ingestion
  const [selectedVideoIds, setSelectedVideoIds] = useState(new Set());

  // Expanded transcript cards
  const [expandedTranscripts, setExpandedTranscripts] = useState(new Set());

  // Ingestion state
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState(null);
  const [ingestError, setIngestError] = useState(null);

  // Auto-generate search queries on entity load
  const fetchDefaultQueries = async () => {
    if (!selectedEntity) return;
    setIsGeneratingQueries(true);
    try {
      // Determine aliases
      const aliases = [];
      if (selectedEntity.name?.includes('Raipur')) {
        aliases.push('NIT Raipur', 'NITRR');
      } else if (selectedEntity.aliases && Array.isArray(selectedEntity.aliases)) {
        aliases.push(...selectedEntity.aliases);
      }

      const res = await axios.post('/api/scraper/youtube/generate-queries', {
        entityId: selectedEntity.entityId,
        entityName: selectedEntity.name,
        domain: selectedEntity.domain,
        entityType: selectedEntity.entityType,
        aliases
      }, { withCredentials: true });

      if (res.data?.queries && Array.isArray(res.data.queries)) {
        // Take top 6 queries by default so search doesn't take too long
        setQueries(res.data.queries.slice(0, 6));
      }
    } catch (err) {
      console.warn('Failed to generate YouTube queries automatically:', err.message);
      // Fallback
      if (selectedEntity.name) {
        setQueries([
          `${selectedEntity.name} review`,
          `${selectedEntity.name} honest review`,
          `${selectedEntity.name} student experience`
        ]);
      }
    } finally {
      setIsGeneratingQueries(false);
    }
  };

  useEffect(() => {
    if (selectedEntity) {
      fetchDefaultQueries();
    }
  }, [selectedEntity]);

  const handleAddQuery = (e) => {
    if (e) e.preventDefault();
    const clean = newQueryInput.trim();
    if (!clean) return;
    if (!queries.includes(clean)) {
      setQueries(prev => [...prev, clean]);
    }
    setNewQueryInput('');
  };

  const handleRemoveQuery = (indexToRemove) => {
    setQueries(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleDiscover = async (e) => {
    if (e) e.preventDefault();
    if (queries.length === 0) {
      setDiscoveryError('Please provide at least one search query.');
      return;
    }

    setIsDiscovering(true);
    setDiscoveryError(null);
    setDiscoveryResult(null);
    setIngestResult(null);
    setIngestError(null);
    setSelectedVideoIds(new Set());
    setExpandedTranscripts(new Set());

    try {
      const res = await axios.post('/api/scraper/youtube/discover', {
        queries,
        maxResultsPerQuery: limitPerQuery,
        extractTranscripts,
        entityId: selectedEntity?.entityId
      }, { withCredentials: true });

      setDiscoveryResult(res.data);

      // Pre-select videos that are likely reviews and not already ingested
      const autoSelected = new Set(
        (res.data.videos || [])
          .filter(v => v.isLikelyReview && !v.alreadyIngested)
          .map(v => v.videoId)
      );
      setSelectedVideoIds(autoSelected);

      // Set filter tab
      if (res.data.counts?.likelyReviews > 0) {
        setActiveFilter('likely');
      } else {
        setActiveFilter('all');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to discover YouTube reviews.';
      setDiscoveryError(msg);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleToggleSelect = (videoId) => {
    setSelectedVideoIds(prev => {
      const next = new Set(prev);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }
      return next;
    });
  };

  const handleToggleExpandTranscript = (videoId) => {
    setExpandedTranscripts(prev => {
      const next = new Set(prev);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }
      return next;
    });
  };

  const getFilteredVideos = () => {
    if (!discoveryResult?.videos) return [];
    const list = discoveryResult.videos;

    switch (activeFilter) {
      case 'likely':
        return list.filter(v => v.isLikelyReview);
      case 'uncertain':
        return list.filter(v => !v.isLikelyReview);
      case 'with_transcripts':
        return list.filter(v => v.hasTranscript);
      case 'all':
      default:
        return list;
    }
  };

  const filteredVideos = getFilteredVideos();

  const handleSelectAllFiltered = () => {
    const next = new Set(selectedVideoIds);
    filteredVideos.forEach(v => {
      if (!v.alreadyIngested) next.add(v.videoId);
    });
    setSelectedVideoIds(next);
  };

  const handleDeselectAllFiltered = () => {
    const next = new Set(selectedVideoIds);
    filteredVideos.forEach(v => next.delete(v.videoId));
    setSelectedVideoIds(next);
  };

  const handleIngestSelected = async () => {
    if (selectedVideoIds.size === 0) return;
    if (!selectedEntity?.entityId) {
      setIngestError('No active entity selected.');
      return;
    }

    const videosToIngest = (discoveryResult?.videos || [])
      .filter(v => selectedVideoIds.has(v.videoId));

    if (videosToIngest.length === 0) return;

    setIsIngesting(true);
    setIngestError(null);
    setIngestResult(null);

    try {
      const res = await axios.post('/api/scraper/youtube/discover/ingest', {
        entityId: selectedEntity.entityId,
        videos: videosToIngest
      }, { withCredentials: true });

      setIngestResult(res.data);

      // Mark ingested in local view
      if (discoveryResult?.videos) {
        const ingestedSet = new Set(videosToIngest.map(v => v.videoId));
        const updatedVideos = discoveryResult.videos.map(v => {
          if (ingestedSet.has(v.videoId)) {
            return { ...v, alreadyIngested: true };
          }
          return v;
        });
        setDiscoveryResult({
          ...discoveryResult,
          videos: updatedVideos
        });
      }
      setSelectedVideoIds(new Set());
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to ingest selected YouTube reviews.';
      setIngestError(msg);
    } finally {
      setIsIngesting(false);
    }
  };

  const formatNumber = (num) => {
    if (!num && num !== 0) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toLocaleString();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="discovery-container" style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '4rem' }}>
      {/* Top Source Discovery Switcher */}
      <SourceDiscoveryTabs activeTab="youtube" />

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(239, 68, 68, 0.12)',
            color: '#ef4444'
          }}>
            <YouTubeIcon size={22} color="#ef4444" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>YouTube Review Discovery</h1>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              Discover student reviews, campus tours, feedback, and video experiences with automated transcript extraction
            </p>
          </div>
        </div>
      </div>

      {/* Search Configuration Card */}
      <div className="card" style={{
        background: 'var(--surface-color)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.25rem',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: '1.5rem'
      }}>
        {/* Entity Banner */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid var(--border-color)',
          marginBottom: '1rem'
        }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Target Entity Context
            </span>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
              {selectedEntity?.name || 'No Entity Selected'}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem' }}>
              <span className="badge" style={{ fontSize: '0.75rem', background: 'var(--surface-color-soft)', color: 'var(--text-secondary)' }}>
                {selectedEntity?.domain || 'General'}
              </span>
              <span className="badge" style={{ fontSize: '0.75rem', background: 'var(--surface-color-soft)', color: 'var(--text-secondary)' }}>
                {selectedEntity?.entityType || 'Organisation'}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchDefaultQueries}
            disabled={isGeneratingQueries || isDiscovering}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
          >
            <RotateCcw size={14} className={isGeneratingQueries ? 'animate-spin' : ''} />
            Reset Default Queries
          </button>
        </div>

        {/* Queries Management */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
            Search Queries ({queries.length})
          </label>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
            Queries are dynamically generated for <strong>{selectedEntity?.name || 'this organisation'}</strong>. You can inspect, edit, remove, or add custom search terms before starting.
          </p>

          {/* Queries Chips List */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            padding: '0.6rem',
            background: 'var(--surface-color-soft)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            minHeight: '48px',
            alignItems: 'center',
            marginBottom: '0.75rem'
          }}>
            {queries.map((q, idx) => (
              <span
                key={idx}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.3rem 0.65rem',
                  background: 'var(--surface-color-strong)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.82rem',
                  color: 'var(--text-primary)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}
              >
                <span>{q}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveQuery(idx)}
                  disabled={isDiscovering}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 0
                  }}
                  title="Remove query"
                >
                  <X size={13} />
                </button>
              </span>
            ))}
            {queries.length === 0 && (
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No search queries configured. Add one below.
              </span>
            )}
          </div>

          {/* Add Query Input */}
          <form onSubmit={handleAddQuery} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="Add another search query (e.g., NIT Raipur faculty review)..."
              value={newQueryInput}
              onChange={(e) => setNewQueryInput(e.target.value)}
              disabled={isDiscovering}
              style={{
                flex: 1,
                padding: '0.55rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--surface-color-strong)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem'
              }}
            />
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={!newQueryInput.trim() || isDiscovering}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}
            >
              <Plus size={15} /> Add Query
            </button>
          </form>
        </div>

        {/* Discovery Options */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--border-color)',
          alignItems: 'center'
        }}>
          {/* Max Results Per Query */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              Results per Query: <span style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>{limitPerQuery}</span>
            </label>
            <input
              type="range"
              min="2"
              max="20"
              step="1"
              value={limitPerQuery}
              onChange={(e) => setLimitPerQuery(Number(e.target.value))}
              disabled={isDiscovering}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span>Fast (2)</span>
              <span>Balanced (6)</span>
              <span>Deep (20)</span>
            </div>
          </div>

          {/* Extract Transcripts Toggle */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
            <input
              type="checkbox"
              id="extractTranscriptsCheck"
              checked={extractTranscripts}
              onChange={(e) => setExtractTranscripts(e.target.checked)}
              disabled={isDiscovering}
              style={{ marginTop: '0.2rem', cursor: 'pointer' }}
            />
            <div>
              <label htmlFor="extractTranscriptsCheck" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                Extract Transcripts
              </label>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Fetches video captions via AI service for richer narrative context
              </div>
            </div>
          </div>

          {/* Run Discovery Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDiscover}
              disabled={isDiscovering || queries.length === 0}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.55rem',
                padding: '0.65rem 1.4rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                cursor: 'pointer'
              }}
            >
              {isDiscovering ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Discovering & Extracting...</span>
                </>
              ) : (
                <>
                  <PlaySquare size={18} />
                  <span>Discover YouTube Reviews</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {discoveryError && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.9rem 1.1rem',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#ef4444',
          fontSize: '0.88rem',
          marginBottom: '1.25rem'
        }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{discoveryError}</span>
        </div>
      )}

      {/* Ingestion Success / Error Banner */}
      {ingestResult && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          padding: '1rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          color: 'var(--status-success)',
          fontSize: '0.9rem',
          marginBottom: '1.25rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <CheckCircle2 size={20} style={{ flexShrink: 0 }} />
            <div>
              <strong>{ingestResult.message}</strong>
              {ingestResult.batchId && (
                <div style={{ fontSize: '0.78rem', opacity: 0.85, marginTop: '0.2rem' }}>
                  Batch ID: <code>{ingestResult.batchId}</code>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate(`/entity/${selectedEntity?.entityId}/processing`)}
              style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <span>Run AI Processing</span>
              <ArrowRight size={14} />
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate(`/entity/${selectedEntity?.entityId}/data`)}
              style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
            >
              View Documents
            </button>
          </div>
        </div>
      )}

      {ingestError && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.9rem 1.1rem',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#ef4444',
          fontSize: '0.88rem',
          marginBottom: '1.25rem'
        }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{ingestError}</span>
        </div>
      )}

      {/* Discovery Results Section */}
      {discoveryResult && (
        <div>
          {/* Summary Metric Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.85rem',
            marginBottom: '1.5rem'
          }}>
            {/* Total Results */}
            <div className="card" style={{ padding: '0.9rem 1rem', background: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Found</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                {discoveryResult.counts?.totalResults || 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>from {queries.length} queries</div>
            </div>

            {/* Unique Videos */}
            <div className="card" style={{ padding: '0.9rem 1rem', background: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Unique Videos</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-blue)', marginTop: '0.2rem' }}>
                {discoveryResult.counts?.uniqueVideos || 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Deduplicated</div>
            </div>

            {/* Likely Reviews */}
            <div className="card" style={{ padding: '0.9rem 1rem', background: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Likely Reviews</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--status-success)', marginTop: '0.2rem' }}>
                {discoveryResult.counts?.likelyReviews || 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Heuristic matched</div>
            </div>

            {/* Transcripts Extracted */}
            <div className="card" style={{ padding: '0.9rem 1rem', background: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Captions Extracted</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#8b5cf6', marginTop: '0.2rem' }}>
                {discoveryResult.counts?.transcriptsExtracted || 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {discoveryResult.counts?.transcriptsUnavailable || 0} unavailable
              </div>
            </div>

            {/* In Database */}
            <div className="card" style={{ padding: '0.9rem 1rem', background: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Already Ingested</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                {discoveryResult.counts?.alreadyIngested || 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Existing in DB</div>
            </div>
          </div>

          {/* Action & Filter Toolbar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.85rem',
            padding: '0.75rem 1rem',
            background: 'var(--surface-color)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            marginBottom: '1rem'
          }}>
            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setActiveFilter('likely')}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid',
                  borderColor: activeFilter === 'likely' ? 'var(--status-success)' : 'var(--border-color)',
                  background: activeFilter === 'likely' ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                  color: activeFilter === 'likely' ? 'var(--status-success)' : 'var(--text-muted)',
                  fontWeight: activeFilter === 'likely' ? 600 : 400,
                  cursor: 'pointer'
                }}
              >
                Likely Reviews ({discoveryResult.counts?.likelyReviews || 0})
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid',
                  borderColor: activeFilter === 'all' ? 'var(--accent-blue)' : 'var(--border-color)',
                  background: activeFilter === 'all' ? 'rgba(37, 99, 235, 0.12)' : 'transparent',
                  color: activeFilter === 'all' ? 'var(--accent-blue)' : 'var(--text-muted)',
                  fontWeight: activeFilter === 'all' ? 600 : 400,
                  cursor: 'pointer'
                }}
              >
                All Videos ({discoveryResult.counts?.uniqueVideos || 0})
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('with_transcripts')}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid',
                  borderColor: activeFilter === 'with_transcripts' ? '#8b5cf6' : 'var(--border-color)',
                  background: activeFilter === 'with_transcripts' ? 'rgba(139, 92, 246, 0.12)' : 'transparent',
                  color: activeFilter === 'with_transcripts' ? '#8b5cf6' : 'var(--text-muted)',
                  fontWeight: activeFilter === 'with_transcripts' ? 600 : 400,
                  cursor: 'pointer'
                }}
              >
                With Transcripts ({discoveryResult.counts?.transcriptsExtracted || 0})
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('uncertain')}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid',
                  borderColor: activeFilter === 'uncertain' ? 'var(--text-secondary)' : 'var(--border-color)',
                  background: activeFilter === 'uncertain' ? 'var(--surface-color-soft)' : 'transparent',
                  color: activeFilter === 'uncertain' ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: activeFilter === 'uncertain' ? 600 : 400,
                  cursor: 'pointer'
                }}
              >
                Uncertain / Other ({discoveryResult.counts?.uncertainOther || 0})
              </button>
            </div>

            {/* Batch Selection Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSelectAllFiltered}
                style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
              >
                Select Filtered
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleDeselectAllFiltered}
                style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
              >
                Deselect Filtered
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleIngestSelected}
                disabled={isIngesting || selectedVideoIds.size === 0}
                style={{
                  fontSize: '0.82rem',
                  padding: '0.45rem 0.95rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontWeight: 600
                }}
              >
                {isIngesting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Ingesting...</span>
                  </>
                ) : (
                  <>
                    <CheckSquare size={14} />
                    <span>Ingest Selected ({selectedVideoIds.size})</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Videos List */}
          {filteredVideos.length === 0 ? (
            <div className="card" style={{
              textAlign: 'center',
              padding: '2.5rem',
              color: 'var(--text-muted)',
              background: 'var(--surface-color)',
              borderRadius: 'var(--radius-md)'
            }}>
              <Info size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.6 }} />
              <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>No videos match the selected filter.</div>
              <div style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>Switch to "All Videos" to view all discovered items.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {filteredVideos.map((video) => {
                const isSelected = selectedVideoIds.has(video.videoId);
                const isExpanded = expandedTranscripts.has(video.videoId);

                return (
                  <div
                    key={video.videoId}
                    className="card"
                    style={{
                      background: 'var(--surface-color)',
                      borderRadius: 'var(--radius-lg)',
                      border: isSelected ? '1.5px solid var(--accent-blue)' : '1px solid var(--border-color)',
                      boxShadow: isSelected ? '0 4px 14px rgba(37, 99, 235, 0.15)' : 'var(--shadow-sm)',
                      padding: '1.1rem',
                      display: 'flex',
                      gap: '1.25rem',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{ paddingTop: '0.2rem' }}>
                      <button
                        type="button"
                        onClick={() => !video.alreadyIngested && handleToggleSelect(video.videoId)}
                        disabled={video.alreadyIngested}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: video.alreadyIngested ? 'not-allowed' : 'pointer',
                          padding: 0,
                          color: video.alreadyIngested
                            ? 'var(--text-muted)'
                            : isSelected
                            ? 'var(--accent-blue)'
                            : 'var(--border-color)'
                        }}
                      >
                        {video.alreadyIngested ? (
                          <CheckCircle2 size={20} color="var(--text-muted)" />
                        ) : isSelected ? (
                          <CheckSquare size={20} />
                        ) : (
                          <Square size={20} />
                        )}
                      </button>
                    </div>

                    {/* Thumbnail */}
                    <div style={{
                      position: 'relative',
                      width: '180px',
                      minWidth: '180px',
                      height: '105px',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      background: '#000000',
                      flexShrink: 0
                    }}>
                      <img
                        src={video.thumbnailUrl}
                        alt={video.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                      {video.durationText && (
                        <span style={{
                          position: 'absolute',
                          bottom: '6px',
                          right: '6px',
                          background: 'rgba(0, 0, 0, 0.82)',
                          color: '#ffffff',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '2px 5px',
                          borderRadius: '4px'
                        }}>
                          {video.durationText}
                        </span>
                      )}
                    </div>

                    {/* Content Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Header Row: Title & Badges */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.4rem' }}>
                        <a
                          href={video.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: '1rem',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            lineHeight: 1.35,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'baseline',
                            gap: '0.35rem'
                          }}
                        >
                          <span>{video.title}</span>
                          <ExternalLink size={13} style={{ flexShrink: 0, opacity: 0.6 }} />
                        </a>

                        {/* Status Badges */}
                        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                          {video.alreadyIngested ? (
                            <span className="badge" style={{ fontSize: '0.72rem', background: 'var(--surface-color-soft)', color: 'var(--text-muted)' }}>
                              Already in DB
                            </span>
                          ) : video.isLikelyReview ? (
                            <span className="badge" style={{ fontSize: '0.72rem', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--status-success)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                              Likely Review
                            </span>
                          ) : (
                            <span className="badge" style={{ fontSize: '0.72rem', background: 'var(--surface-color-soft)', color: 'var(--text-muted)' }}>
                              Uncertain
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Channel & Stats Line */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.9rem',
                        fontSize: '0.78rem',
                        color: 'var(--text-secondary)',
                        marginBottom: '0.6rem'
                      }}>
                        <a
                          href={video.channelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontWeight: 600, color: 'var(--text-primary)' }}
                        >
                          {video.channelName}
                        </a>
                        <span>•</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Eye size={13} /> {formatNumber(video.viewCount)} views
                        </span>
                        <span>•</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <ThumbsUp size={13} /> {formatNumber(video.likeCount)}
                        </span>
                        <span>•</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <MessageSquare size={13} /> {formatNumber(video.commentCount)} comments
                        </span>
                        {video.publishedAt && (
                          <>
                            <span>•</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Clock size={13} /> {formatDate(video.publishedAt)}
                            </span>
                          </>
                        )}
                        <span style={{
                          marginLeft: 'auto',
                          fontSize: '0.72rem',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: 'var(--surface-color-soft)',
                          color: 'var(--text-muted)'
                        }}>
                          Query: {video.searchQuery}
                        </span>
                      </div>

                      {/* Relevance Reason */}
                      {video.relevanceReason && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontStyle: 'italic' }}>
                          Relevance signal: {video.relevanceReason}
                        </div>
                      )}

                      {/* Transcript Box */}
                      <div style={{
                        background: 'var(--surface-color-soft)',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.65rem 0.85rem',
                        border: '1px solid var(--border-color)',
                        marginTop: '0.4rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <FileText size={14} color={video.hasTranscript ? '#8b5cf6' : 'var(--text-muted)'} />
                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {video.hasTranscript ? 'Transcript Available' : 'No Captions Available'}
                            </span>
                            {video.hasTranscript && video.transcriptData && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                ({video.transcriptData.word_count} words • ~{video.transcriptData.estimated_reading_minutes} min read)
                              </span>
                            )}
                            {video.transcriptStatus === 'disabled' && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--accent-orange)' }}>
                                (Captions disabled by creator)
                              </span>
                            )}
                          </div>

                          {video.hasTranscript && (
                            <button
                              type="button"
                              onClick={() => handleToggleExpandTranscript(video.videoId)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--accent-blue)',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                                padding: 0
                              }}
                            >
                              {isExpanded ? (
                                <><span>Collapse</span><ChevronUp size={13} /></>
                              ) : (
                                <><span>Read full</span><ChevronDown size={13} /></>
                              )}
                            </button>
                          )}
                        </div>

                        {video.hasTranscript ? (
                          <div style={{
                            fontSize: '0.8rem',
                            color: 'var(--text-secondary)',
                            lineHeight: 1.5,
                            maxHeight: isExpanded ? '350px' : '60px',
                            overflowY: isExpanded ? 'auto' : 'hidden',
                            position: 'relative'
                          }}>
                            {isExpanded
                              ? video.transcriptData?.raw_text || video.transcriptSnippet
                              : video.transcriptSnippet || (video.transcriptData?.raw_text || '').slice(0, 220) + '...'}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            {video.transcriptError || 'Video description will be used as document content if ingested.'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default YouTubeDiscovery;

