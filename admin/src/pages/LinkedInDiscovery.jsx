import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
  Compass, CheckCircle2, AlertCircle, ExternalLink, Loader2, ArrowRight,
  Filter, CheckSquare, Square, Info, RotateCcw, MessageSquare, ThumbsUp,
  Tag, ShieldAlert, Sparkles, Building2
} from 'lucide-react';
import { useEntity } from '../context/EntityContext';
import SourceDiscoveryTabs from '../components/SourceDiscoveryTabs';

const LinkedInDiscovery = () => {
  const { selectedEntity } = useEntity();
  const navigate = useNavigate();

  // Search parameters
  const [organisation, setOrganisation] = useState('');
  const [aliasesInput, setAliasesInput] = useState('');
  const [limitPerQuery, setLimitPerQuery] = useState(20);

  // States
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState(null);
  const [discoveryError, setDiscoveryError] = useState(null);

  // Active filter tab: 'all' | 'Relevant Opinion' | 'News / Announcement' | 'Irrelevant' | 'Uncertain'
  const [activeFilter, setActiveFilter] = useState('Relevant Opinion');

  // Selected posts for bulk ingestion
  const [selectedPostIds, setSelectedPostIds] = useState(new Set());

  // Ingestion states
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState(null);
  const [ingestError, setIngestError] = useState(null);

  // Auto-populate organisation and aliases from selectedEntity
  useEffect(() => {
    if (selectedEntity) {
      setOrganisation(selectedEntity.name || '');
      // Example default aliases based on known institutions
      if (selectedEntity.name?.includes('Raipur')) {
        setAliasesInput('National Institute of Technology Raipur, NITRR');
      } else {
        setAliasesInput('');
      }
    }
  }, [selectedEntity]);

  const handleDiscover = async (e) => {
    if (e) e.preventDefault();
    const cleanOrg = organisation.trim();
    if (!cleanOrg) {
      setDiscoveryError('Please provide an organisation name.');
      return;
    }

    setIsDiscovering(true);
    setDiscoveryError(null);
    setDiscoveryResult(null);
    setIngestResult(null);
    setIngestError(null);
    setSelectedPostIds(new Set());

    const aliases = aliasesInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    try {
      const res = await axios.post('/api/scraper/linkedin/discover', {
        organisation: cleanOrg,
        aliases,
        limit: limitPerQuery
      }, { withCredentials: true });

      setDiscoveryResult(res.data);

      // By default, select all posts classified as "Relevant Opinion"
      const relevantIds = new Set(
        (res.data.posts || [])
          .filter(p => p.classification === 'Relevant Opinion')
          .map(p => p.id)
      );
      setSelectedPostIds(relevantIds);

      // Default active filter to 'Relevant Opinion' if any exist, else 'all'
      if (res.data.counts?.relevantOpinion > 0) {
        setActiveFilter('Relevant Opinion');
      } else {
        setActiveFilter('all');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to discover and classify LinkedIn opinions.';
      setDiscoveryError(msg);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleToggleSelect = (postId) => {
    setSelectedPostIds(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  };

  const filteredPosts = React.useMemo(() => {
    if (!discoveryResult?.posts) return [];
    if (activeFilter === 'all') return discoveryResult.posts;
    return discoveryResult.posts.filter(p => p.classification === activeFilter);
  }, [discoveryResult, activeFilter]);

  const handleSelectAllFiltered = () => {
    setSelectedPostIds(prev => {
      const next = new Set(prev);
      filteredPosts.forEach(p => next.add(p.id));
      return next;
    });
  };

  const handleDeselectAllFiltered = () => {
    setSelectedPostIds(prev => {
      const next = new Set(prev);
      filteredPosts.forEach(p => next.delete(p.id));
      return next;
    });
  };

  const handleIngestSelected = async () => {
    if (!discoveryResult?.posts || selectedPostIds.size === 0) return;
    if (!selectedEntity?.entityId) {
      setIngestError('Please select an entity before ingesting documents.');
      return;
    }

    const postsToIngest = discoveryResult.posts.filter(p => selectedPostIds.has(p.id));
    if (postsToIngest.length === 0) return;

    setIsIngesting(true);
    setIngestError(null);

    try {
      const res = await axios.post('/api/scraper/linkedin/discover/ingest', {
        entityId: selectedEntity.entityId,
        posts: postsToIngest
      }, { withCredentials: true });

      setIngestResult(res.data);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to ingest selected LinkedIn opinion posts.';
      setIngestError(msg);
    } finally {
      setIsIngesting(false);
    }
  };

  const handleReset = () => {
    setDiscoveryResult(null);
    setDiscoveryError(null);
    setIngestResult(null);
    setIngestError(null);
    setSelectedPostIds(new Set());
  };

  const getClassificationBadgeStyle = (classification) => {
    switch (classification) {
      case 'Relevant Opinion':
        return { backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#16a34a', border: '1px solid rgba(34, 197, 94, 0.3)' };
      case 'News / Announcement':
        return { backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#2563eb', border: '1px solid rgba(59, 130, 246, 0.3)' };
      case 'Irrelevant':
        return { backgroundColor: 'rgba(148, 163, 184, 0.15)', color: '#64748b', border: '1px solid rgba(148, 163, 184, 0.3)' };
      default:
        return { backgroundColor: 'rgba(234, 179, 8, 0.15)', color: '#ca8a04', border: '1px solid rgba(234, 179, 8, 0.3)' };
    }
  };

  return (
    <div style={{ paddingBottom: '60px' }}>
      {/* Top Source Discovery Switcher */}
      <SourceDiscoveryTabs activeTab="linkedin" />

      {/* Page Header */}
      <div className="flex flex-col mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: 'rgba(2, 132, 199, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
            <Compass size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              LinkedIn Opinion Discovery
            </h1>
            <p className="text-secondary" style={{ fontSize: '0.95rem', margin: 0 }}>
              Discover public LinkedIn posts mentioning an organisation and automatically filter for direct opinions using the <span className="font-semibold text-primary">Allam-2-7B</span> SLM.
            </p>
          </div>
        </div>
      </div>

      {/* SEARCH CARD */}
      <div className="card shadow-sm mb-6" style={{ borderColor: 'var(--border-color)', background: 'var(--surface-color)' }}>
        <form onSubmit={handleDiscover} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Organisation Name *
              </label>
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  placeholder="e.g., NIT Raipur, IIT Bombay, Harvard University"
                  value={organisation}
                  onChange={(e) => setOrganisation(e.target.value)}
                  disabled={isDiscovering || isIngesting}
                  className="form-control"
                  style={{ flex: 1, fontSize: '0.875rem' }}
                  required
                />
              </div>
              <p className="text-xs text-muted mt-1.5">
                Primary organisation name queried across public LinkedIn post discussions.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Alternative Names / Aliases (Comma-separated)
              </label>
              <input 
                type="text" 
                placeholder="e.g., National Institute of Technology Raipur, NITRR"
                value={aliasesInput}
                onChange={(e) => setAliasesInput(e.target.value)}
                disabled={isDiscovering || isIngesting}
                className="form-control"
                style={{ width: '100%', fontSize: '0.875rem' }}
              />
              <p className="text-xs text-muted mt-1.5">
                Acronyms and alternate names searched to ensure comprehensive discovery.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl border" style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border-color)' }}>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-secondary">
                Max Posts per Search Query
              </div>
              <div className="text-xs text-muted">
                Configurable results per search variant (10 to 50). Duplicates across queries are automatically merged.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="number"
                min="5"
                max="50"
                step="5"
                value={limitPerQuery}
                onChange={(e) => setLimitPerQuery(Math.min(50, Math.max(5, Number(e.target.value) || 20)))}
                disabled={isDiscovering || isIngesting}
                className="form-control"
                style={{ width: '80px', textAlign: 'center', fontWeight: 600 }}
              />
              <span className="text-xs text-muted">posts / query</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-muted">
              {discoveryResult ? (
                <span className="text-green-600 dark:text-green-400 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 size={15} /> Discovered {discoveryResult.totalUnique} unique posts. Filtered with Allam-2-7B.
                </span>
              ) : (
                <span>Searches public posts via Apify and classifies direct opinions using Allam-2-7B SLM.</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {discoveryResult && (
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isDiscovering || isIngesting}
                  className="btn btn-secondary text-xs flex items-center gap-1.5"
                >
                  <RotateCcw size={13} />
                  <span>Reset Search</span>
                </button>
              )}
              <button 
                type="submit" 
                disabled={isDiscovering || isIngesting || !organisation.trim()}
                className="btn font-semibold flex items-center gap-2 shadow-sm"
                style={{
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.65rem 1.4rem',
                  borderRadius: '8px',
                  cursor: isDiscovering ? 'not-allowed' : 'pointer'
                }}
              >
                {isDiscovering ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    <span>Discovering & Classifying...</span>
                  </>
                ) : (
                  <>
                    <Compass size={16} />
                    <span>Discover & Classify Opinions</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Error Alert */}
        {discoveryError && (
          <div 
            className="p-4 mt-4 rounded-xl border flex flex-col gap-2"
            style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.25)', color: 'var(--text-primary)' }}
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div className="text-sm font-medium">{discoveryError}</div>
            </div>
            {discoveryError.toLowerCase().includes('apify_api_token') && (
              <div className="text-xs text-secondary pl-7">
                <strong>Setup Hint:</strong> Add <code>APIFY_API_TOKEN=your_token</code> to <code>backend/.env</code> and restart backend.
              </div>
            )}
          </div>
        )}
      </div>

      {/* DISCOVERY RESULTS SECTION */}
      {discoveryResult && (
        <div className="space-y-6">
          {/* STATS METRIC CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div 
              onClick={() => setActiveFilter('all')}
              className="card shadow-sm text-center p-3 cursor-pointer transition-all"
              style={{
                borderColor: activeFilter === 'all' ? 'var(--accent-blue)' : 'var(--border-color)',
                backgroundColor: activeFilter === 'all' ? 'var(--surface-color-soft)' : 'var(--surface-color)'
              }}
            >
              <div className="text-xs text-muted uppercase font-semibold">Total Unique</div>
              <div className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
                {discoveryResult.totalUnique}
              </div>
            </div>

            <div 
              onClick={() => setActiveFilter('Relevant Opinion')}
              className="card shadow-sm text-center p-3 cursor-pointer transition-all"
              style={{
                borderColor: activeFilter === 'Relevant Opinion' ? '#16a34a' : 'rgba(34, 197, 94, 0.3)',
                backgroundColor: 'rgba(34, 197, 94, 0.08)'
              }}
            >
              <div className="text-xs text-green-600 dark:text-green-400 uppercase font-semibold flex items-center justify-center gap-1">
                <Sparkles size={12} />
                <span>Relevant Opinions</span>
              </div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                {discoveryResult.counts.relevantOpinion}
              </div>
            </div>

            <div 
              onClick={() => setActiveFilter('News / Announcement')}
              className="card shadow-sm text-center p-3 cursor-pointer transition-all"
              style={{
                borderColor: activeFilter === 'News / Announcement' ? '#2563eb' : 'rgba(59, 130, 246, 0.3)',
                backgroundColor: 'rgba(59, 130, 246, 0.08)'
              }}
            >
              <div className="text-xs text-blue-600 dark:text-blue-400 uppercase font-semibold">News / Updates</div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                {discoveryResult.counts.newsAnnouncement}
              </div>
            </div>

            <div 
              onClick={() => setActiveFilter('Irrelevant')}
              className="card shadow-sm text-center p-3 cursor-pointer transition-all"
              style={{
                borderColor: activeFilter === 'Irrelevant' ? '#64748b' : 'rgba(148, 163, 184, 0.3)',
                backgroundColor: 'rgba(148, 163, 184, 0.08)'
              }}
            >
              <div className="text-xs text-muted uppercase font-semibold">Irrelevant</div>
              <div className="text-2xl font-bold text-secondary mt-1">
                {discoveryResult.counts.irrelevant}
              </div>
            </div>

            <div 
              onClick={() => setActiveFilter('Uncertain')}
              className="card shadow-sm text-center p-3 cursor-pointer transition-all"
              style={{
                borderColor: activeFilter === 'Uncertain' ? '#ca8a04' : 'rgba(234, 179, 8, 0.3)',
                backgroundColor: 'rgba(234, 179, 8, 0.08)'
              }}
            >
              <div className="text-xs text-yellow-600 dark:text-yellow-400 uppercase font-semibold">Needs Review</div>
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">
                {discoveryResult.counts.uncertain}
              </div>
            </div>
          </div>

          {/* FILTER TABS & SELECTION BAR */}
          <div className="card shadow-sm" style={{ borderColor: 'var(--border-color)', background: 'var(--surface-color)' }}>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
              {/* Category Filter Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveFilter('all')}
                  className={`btn btn-sm ${activeFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', height: '30px' }}
                >
                  All ({discoveryResult.totalUnique})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('Relevant Opinion')}
                  className={`btn btn-sm ${activeFilter === 'Relevant Opinion' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    fontSize: '0.75rem',
                    height: '30px',
                    backgroundColor: activeFilter === 'Relevant Opinion' ? '#16a34a' : undefined,
                    borderColor: activeFilter === 'Relevant Opinion' ? '#16a34a' : undefined
                  }}
                >
                  Relevant Opinions ({discoveryResult.counts.relevantOpinion})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('News / Announcement')}
                  className={`btn btn-sm ${activeFilter === 'News / Announcement' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', height: '30px' }}
                >
                  News ({discoveryResult.counts.newsAnnouncement})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('Irrelevant')}
                  className={`btn btn-sm ${activeFilter === 'Irrelevant' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', height: '30px' }}
                >
                  Irrelevant ({discoveryResult.counts.irrelevant})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('Uncertain')}
                  className={`btn btn-sm ${activeFilter === 'Uncertain' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', height: '30px' }}
                >
                  Review ({discoveryResult.counts.uncertain})
                </button>
              </div>

              {/* Quick Select Actions */}
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  className="text-blue-500 hover:underline flex items-center gap-1 font-medium"
                >
                  <CheckSquare size={14} />
                  <span>Select Filtered</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllFiltered}
                  className="text-muted hover:underline flex items-center gap-1 font-medium"
                >
                  <Square size={14} />
                  <span>Deselect Filtered</span>
                </button>
                <span className="font-semibold text-primary ml-1">
                  {selectedPostIds.size} of {discoveryResult.totalUnique} selected
                </span>
              </div>
            </div>

            {/* POSTS LIST */}
            {filteredPosts.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted">
                No posts found under the "{activeFilter}" classification.
              </div>
            ) : (
              <div className="flex flex-col gap-3.5 pt-4">
                {filteredPosts.map((post) => {
                  const isChecked = selectedPostIds.has(post.id);
                  const badgeStyle = getClassificationBadgeStyle(post.classification);

                  return (
                    <div 
                      key={post.id}
                      className="p-4 rounded-xl border text-xs flex flex-col gap-2.5 transition-all"
                      style={{
                        backgroundColor: isChecked ? 'rgba(59, 130, 246, 0.03)' : 'var(--bg-color)',
                        borderColor: isChecked ? 'rgba(59, 130, 246, 0.4)' : 'var(--border-color)',
                        boxShadow: isChecked ? '0 1px 3px rgba(59, 130, 246, 0.1)' : 'none'
                      }}
                    >
                      {/* Post Header Row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleSelect(post.id)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer', marginTop: '2px' }}
                          />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                                {post.author}
                              </span>
                              {post.authorHeadline && (
                                <span className="text-muted truncate max-w-sm hidden sm:inline" title={post.authorHeadline}>
                                  • {post.authorHeadline}
                                </span>
                              )}
                              <span 
                                className="px-2 py-0.5 rounded text-[11px] font-bold"
                                style={badgeStyle}
                              >
                                {post.classification}
                              </span>
                              {post.opinion_type && post.opinion_type !== 'None' && (
                                <span 
                                  className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-secondary border border-gray-200 dark:border-gray-700"
                                >
                                  {post.opinion_type}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted mt-0.5 flex items-center gap-2">
                              {post.publicationDate && (
                                <span>{new Date(post.publicationDate).toLocaleDateString()}</span>
                              )}
                              <span>• Matched query: "{post.matchedQuery}"</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 text-muted">
                          {post.likesCount > 0 && <span>👍 {post.likesCount}</span>}
                          {post.commentsCount > 0 && <span>💬 {post.commentsCount}</span>}
                          <a 
                            href={post.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline flex items-center gap-1 font-medium"
                          >
                            <span>Open</span>
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      </div>

                      {/* AI Classification Reason Callout */}
                      <div 
                        className="p-2.5 rounded-lg border text-xs leading-relaxed"
                        style={{
                          backgroundColor: post.classification === 'Relevant Opinion' ? 'rgba(34, 197, 94, 0.05)' : 'var(--surface-color)',
                          borderColor: post.classification === 'Relevant Opinion' ? 'rgba(34, 197, 94, 0.2)' : 'var(--border-color)',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        <strong className="text-primary">Allam-2-7B Analysis:</strong> {post.reason}
                      </div>

                      {/* Post Raw Content */}
                      <div 
                        className="p-3 rounded-lg text-xs leading-relaxed border"
                        style={{ 
                          backgroundColor: 'var(--surface-color)', 
                          borderColor: 'var(--border-color)',
                          color: 'var(--text-primary)',
                          maxHeight: '120px',
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap'
                        }}
                      >
                        {post.rawText}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Ingestion Success Banner */}
            {ingestResult && (
              <div 
                className="p-4 mt-6 rounded-xl border flex flex-col gap-3"
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
                </div>
              </div>
            )}

            {/* Ingestion Error Alert */}
            {ingestError && (
              <div 
                className="p-4 mt-4 rounded-xl border text-sm flex items-start gap-2.5"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.25)', color: 'var(--text-primary)' }}
              >
                <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                <div>{ingestError}</div>
              </div>
            )}

            {/* Bulk Ingest Action Bar */}
            {!ingestResult && filteredPosts.length > 0 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <span className="text-xs text-muted">
                  Adds selected original posts as separate documents to MongoDB and queues a batch processing job.
                </span>
                <button
                  type="button"
                  onClick={handleIngestSelected}
                  disabled={isIngesting || selectedPostIds.size === 0}
                  className="btn font-semibold flex items-center gap-2 shadow-sm"
                  style={{
                    background: selectedPostIds.size > 0 ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' : '#94a3b8',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.75rem 1.75rem',
                    borderRadius: '8px',
                    cursor: selectedPostIds.size > 0 && !isIngesting ? 'pointer' : 'not-allowed'
                  }}
                >
                  {isIngesting ? (
                    <>
                      <Loader2 size={16} className="spin" />
                      <span>Ingesting Selected Opinions...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Add Selected as Documents ({selectedPostIds.size} Posts)</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LinkedInDiscovery;
