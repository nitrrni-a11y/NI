import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, {
  fetchEntityNarratives,
  fetchEntityTopics,
  toArray,
} from '../services/api';
import {
  Network,
  TrendingUp,
  Bookmark,
  ArrowLeft,
  Search,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Loader2,
  Building2,
  Folder,
} from 'lucide-react';
import { useEntity } from '../context/EntityContext';
import TrendGraph from '../components/TrendGraph';
import {
  normalizeTopicName,
  getHighlightClassificationMeta,
  getHighlightConfidencePercent,
} from '../components/HighlightCard';

const Narratives = () => {
  const { entities, selectedEntity, changeEntity } = useEntity();
  const navigate = useNavigate();

  const [narratives, setNarratives] = useState([]);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState('all'); // 'all' | 'positive' | 'negative' | 'neutral' | 'mixed'
  const [topicFilter, setTopicFilter] = useState('all');
  const [expandedIds, setExpandedIds] = useState(new Set());

  // Navigation State: 'LIST' | 'DETAIL'
  const [view, setView] = useState('LIST');
  const [selectedNarrative, setSelectedNarrative] = useState(null);

  const safeEntities = Array.isArray(entities) ? entities : [];

  useEffect(() => {
    let cancelled = false;
    const loadNarratives = async () => {
      if (!selectedEntity?.entityId) {
        setNarratives([]);
        setTopics([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setView('LIST');
      setSelectedNarrative(null);
      setTopicFilter('all');
      setExpandedIds(new Set());

      try {
        const [narList, topicList] = await Promise.all([
          fetchEntityNarratives(selectedEntity.entityId),
          fetchEntityTopics(selectedEntity.entityId).catch(() => []),
        ]);
        if (cancelled) return;
        setNarratives(Array.isArray(narList) ? narList : []);
        setTopics(Array.isArray(topicList) ? topicList : []);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch narratives:', err);
          setNarratives([]);
          setTopics([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadNarratives();
    return () => {
      cancelled = true;
    };
  }, [selectedEntity?.entityId]);

  const eligibleNarratives = useMemo(() => {
    const safeList = Array.isArray(narratives) ? narratives : [];
    return safeList.filter(
      (n) => n && n.isEligibleForDisplay !== false && n.displayStatus !== 'candidate'
    );
  }, [narratives]);

  const availableTopics = useMemo(() => {
    const topicSet = new Set();
    eligibleNarratives.forEach((n) => {
      topicSet.add(normalizeTopicName(n.topic, selectedEntity?.name));
    });
    (Array.isArray(topics) ? topics : []).forEach((t) => {
      if (t?.name) topicSet.add(normalizeTopicName(t.name, selectedEntity?.name));
    });
    return Array.from(topicSet).sort();
  }, [eligibleNarratives, topics, selectedEntity?.name]);

  const filteredNarratives = useMemo(() => {
    return eligibleNarratives.filter((n) => {
      if (sentimentFilter !== 'all') {
        const dir = n.direction || 'neutral';
        if (dir !== sentimentFilter) return false;
      }

      if (topicFilter !== 'all') {
        if (normalizeTopicName(n.topic, selectedEntity?.name) !== topicFilter) return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const sourcesList = toArray(n.supportingEvidence, 'sources');
      return (
        (n.topic && n.topic.toLowerCase().includes(q)) ||
        (n.description && n.description.toLowerCase().includes(q)) ||
        (n.intelligence && n.intelligence.toLowerCase().includes(q)) ||
        (n.recommendation && n.recommendation.toLowerCase().includes(q)) ||
        sourcesList.some((s) => String(s).toLowerCase().includes(q))
      );
    });
  }, [eligibleNarratives, sentimentFilter, topicFilter, searchQuery, selectedEntity?.name]);

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openFullAnalytics = (narrative) => {
    setSelectedNarrative(narrative);
    setView('DETAIL');
    if (narrative?._id) {
      api.get(`/narratives/${narrative._id}`)
        .then((res) => {
          if (res.data && typeof res.data === 'object') {
            setSelectedNarrative((prev) => (prev && prev._id === narrative._id ? res.data : prev));
          }
        })
        .catch(() => {});
    }
  };

  // Prompt user cleanly if no entity is selected yet
  if (!selectedEntity && !loading) {
    return (
      <div className="max-w-5xl mx-auto p-6 pb-12">
        <div className="card p-10 text-center">
          <Folder size={44} className="mx-auto mb-3 text-muted" style={{ opacity: 0.65 }} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Select a Domain &amp; Entity First
          </h2>
          <p className="text-secondary text-sm mb-6" style={{ maxWidth: '480px', margin: '0 auto 1.5rem' }}>
            Narratives are scoped to a workspace entity. Choose a Domain and Entity in Overview or pick a tracked workspace below.
          </p>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn btn-primary btn-sm flex items-center gap-2"
            >
              <span>Select Domain &amp; Entity</span>
              <ArrowRight size={15} />
            </button>

            {safeEntities.length > 0 && (
              <select
                aria-label="Quick select entity workspace"
                value=""
                onChange={(e) => {
                  if (e.target.value) changeEntity(e.target.value, false);
                }}
                className="form-control text-sm font-semibold"
              >
                <option value="">Or jump directly to an entity...</option>
                {safeEntities.map((ent) => (
                  <option key={ent.entityId} value={ent.entityId}>
                    {ent.name} ({ent.domain || 'General'})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 pb-12">
      {view === 'DETAIL' && selectedNarrative ? (
        <div>
          <div className="flex flex-col mb-8">
            <div>
              <button
                type="button"
                onClick={() => setView('LIST')}
                className="btn btn-secondary btn-sm flex items-center gap-1 mb-6"
              >
                <ArrowLeft size={16} />
                <span>Back to Narratives</span>
              </button>
            </div>

            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className="badge-outline">
                {normalizeTopicName(selectedNarrative.topic, selectedEntity?.name)}
              </span>
              {(() => {
                const meta = getHighlightClassificationMeta(selectedNarrative);
                return (
                  <span
                    className="px-3 py-1 rounded text-xs font-bold"
                    style={{ background: meta.badgeBg, color: meta.badgeColor }}
                  >
                    {meta.label}
                  </span>
                );
              })()}
            </div>

            {/* Highlighted Narrative Statement */}
            <div
              className="rounded-xl p-5 border mb-6"
              style={{
                background: 'rgba(37, 99, 235, 0.07)',
                borderColor: 'rgba(59, 130, 246, 0.3)',
                borderLeft: '4px solid var(--accent-blue)',
              }}
            >
              <div className="text-xs font-bold uppercase mb-2" style={{ color: 'var(--accent-blue)' }}>
                Narrative Statement
              </div>
              <p
                className="text-lg font-bold leading-relaxed m-0"
                style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}
              >
                &ldquo;{selectedNarrative.description}&rdquo;
              </p>
            </div>

            {/* 4-Metric Horizontal Row */}
            <div
              className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl border mb-6"
              style={{ background: 'var(--surface-color-soft)' }}
            >
              <div>
                <span className="text-secondary text-xs font-semibold block mb-1">Claim Count</span>
                <strong className="text-lg" style={{ color: 'var(--text-primary)' }}>
                  {selectedNarrative.analysis?.claim_count ?? 0}
                </strong>
              </div>
              <div>
                <span className="text-secondary text-xs font-semibold block mb-1">Source Count</span>
                <strong className="text-lg" style={{ color: 'var(--text-primary)' }}>
                  {selectedNarrative.analysis?.source_count ??
                    toArray(selectedNarrative.supportingEvidence, 'sources').length}
                </strong>
              </div>
              <div>
                <span className="text-secondary text-xs font-semibold block mb-1">Trend</span>
                <strong className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  {selectedNarrative.trend || selectedNarrative.analysis?.trend || 'Insufficient Data'}
                </strong>
              </div>
              <div>
                <span className="text-secondary text-xs font-semibold block mb-1">Last Observed</span>
                <strong className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {selectedNarrative.lastObservedAt
                    ? new Date(selectedNarrative.lastObservedAt).toLocaleDateString()
                    : 'N/A'}
                </strong>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <TrendGraph
              timeline={selectedNarrative.timeline || selectedNarrative.analysis?.temporal_information?.timeline || []}
              trend={selectedNarrative.trend || selectedNarrative.analysis?.trend || 'Insufficient Data'}
              title="Evidence Velocity & Temporal Activity"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {selectedNarrative.recommendation && (
                <div
                  className="card p-5"
                  style={{
                    background: 'rgba(16, 185, 129, 0.08)',
                    borderColor: 'rgba(16, 185, 129, 0.35)',
                    borderLeft: '4px solid #10b981',
                  }}
                >
                  <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase" style={{ color: '#059669' }}>
                    <Lightbulb size={15} />
                    <span>Actionable Recommendation</span>
                  </div>
                  <p className="italic leading-relaxed m-0 text-sm" style={{ color: 'var(--text-primary)' }}>
                    &ldquo;{selectedNarrative.recommendation}&rdquo;
                  </p>
                </div>
              )}

              <div className="card p-5">
                <h3 className="font-semibold text-sm mb-2 border-b pb-2">
                  Executive Intelligence Brief
                </h3>
                <p className="text-secondary leading-relaxed m-0 text-sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {selectedNarrative.intelligence || 'No detailed intelligence available.'}
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="card p-5">
                <h3 className="font-semibold mb-3 text-sm">
                  Supporting Sources ({toArray(selectedNarrative.supportingEvidence, 'sources').length})
                </h3>
                {toArray(selectedNarrative.supportingEvidence, 'sources').length > 0 ? (
                  <ul className="text-sm text-secondary space-y-2" style={{ paddingLeft: '1.2rem' }}>
                    {toArray(selectedNarrative.supportingEvidence, 'sources').map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted m-0">No specific sources identified.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* NARRATIVES LIST VIEW */
        <div>
          {/* Top Breadcrumb to Entity Dashboard */}
          {selectedEntity && (
            <div className="mb-4 flex items-center gap-3 flex-wrap">
              <Link
                to={`/?domain=${encodeURIComponent(selectedEntity.domain || 'General')}&entity=${encodeURIComponent(selectedEntity.entityId)}`}
                className="btn btn-secondary btn-sm flex items-center gap-1"
                style={{ textDecoration: 'none' }}
              >
                <ArrowLeft size={14} />
                <span>Back to Entity Dashboard</span>
              </Link>
              <span className="text-xs text-muted font-semibold">
                {selectedEntity.domain || 'General'} / {selectedEntity.name}
              </span>
            </div>
          )}

          {/* Header & Entity Switcher */}
          <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
            <div>
              <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                Narratives Explorer
              </h1>
              <p className="text-secondary m-0" style={{ fontSize: '0.98rem' }}>
                Synthesized storylines, topic tags, confidence scores, and supporting claims
                {selectedEntity?.name ? ` for ${selectedEntity.name}` : ''}.
              </p>
            </div>

            {safeEntities.length > 0 && (
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-muted" />
                <select
                  aria-label="Select Entity Workspace"
                  value={selectedEntity?.entityId || ''}
                  onChange={(e) => changeEntity(e.target.value, false)}
                  className="form-control text-sm font-semibold"
                  style={{ minWidth: '220px' }}
                >
                  {safeEntities.map((ent) => (
                    <option key={ent.entityId} value={ent.entityId}>
                      {ent.name} ({ent.domain || 'General'})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Search + Topic & Sentiment Filters */}
          <div className="card p-4 mb-6 space-y-3" style={{ borderRadius: '16px' }}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2" style={{ position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '0.85rem',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Search size={16} />
                </div>
                <input
                  type="text"
                  placeholder="Search narratives, topics, recommendations, or sources..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-control text-sm w-full"
                  style={{ paddingLeft: '2.45rem' }}
                />
              </div>

              <select
                aria-label="Filter by Topic"
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
                className="form-control text-sm"
              >
                <option value="all">All Topics ({availableTopics.length})</option>
                {availableTopics.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: 'all', label: 'All Sentiments' },
                  { id: 'positive', label: 'Positive / Praise' },
                  { id: 'negative', label: 'Critical / Negative' },
                  { id: 'neutral', label: 'Neutral' },
                  { id: 'mixed', label: 'Mixed' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSentimentFilter(opt.id)}
                    className={`btn btn-sm ${sentimentFilter === opt.id ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <span className="text-xs text-muted font-semibold">
                Showing {filteredNarratives.length} of {eligibleNarratives.length} narratives
              </span>
            </div>
          </div>

          {/* Narratives List */}
          {loading ? (
            <div className="card p-10 flex items-center justify-center gap-2 text-secondary text-sm">
              <Loader2 size={18} className="animate-spin" />
              <span>Loading narratives for {selectedEntity?.name || 'workspace'}...</span>
            </div>
          ) : eligibleNarratives.length === 0 ? (
            <div className="card p-10 text-center text-secondary">
              <Network size={44} className="text-muted mx-auto mb-3" style={{ opacity: 0.65 }} />
              <h3 className="text-lg font-semibold mb-1">
                No narratives found for {selectedEntity?.name || 'this entity'} yet.
              </h3>
              <p className="text-sm text-muted m-0">
                Ingest documents and run the AI pipeline in Admin to synthesize narratives.
              </p>
            </div>
          ) : filteredNarratives.length === 0 ? (
            <div className="card p-10 text-center text-secondary">
              <Network size={40} className="text-muted mx-auto mb-2" style={{ opacity: 0.65 }} />
              <h3 className="text-lg font-semibold mb-1">No matching narratives found.</h3>
              <p className="text-xs text-muted m-0">Try clearing your search query or filters.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredNarratives.map((n) => {
                const narKey = n._id || n.narrativeId;
                const meta = getHighlightClassificationMeta(n);
                const confidencePct = getHighlightConfidencePercent(n);
                const sourcesList = toArray(n.supportingEvidence, 'sources');
                const claimIdsList = toArray(n.supportingEvidence, 'claim_ids');
                const claimCount = n.analysis?.claim_count ?? claimIdsList.length ?? 0;
                const sourceCount = n.analysis?.source_count ?? sourcesList.length ?? 0;
                const topicLabel = normalizeTopicName(n.topic, selectedEntity?.name);
                const isExpanded = expandedIds.has(narKey);

                return (
                  <div
                    key={narKey}
                    className="card transition-all"
                    style={{
                      borderLeft: `4px solid ${meta.borderColor}`,
                      padding: '1.25rem 1.35rem',
                    }}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-3 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="inline-flex items-center gap-1 font-semibold px-2.5 py-0.5 rounded-md"
                          style={{
                            background: 'var(--surface-color-soft)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <Bookmark size={12} />
                          <span>{topicLabel}</span>
                        </span>

                        <span
                          className="inline-flex items-center gap-1 font-semibold px-2.5 py-0.5 rounded-md"
                          style={{
                            background: meta.badgeBg,
                            color: meta.badgeColor,
                          }}
                        >
                          <span>{meta.label}</span>
                        </span>

                        {confidencePct > 0 && (
                          <span
                            className="font-semibold px-2.5 py-0.5 rounded-full"
                            style={{
                              background: 'rgba(37, 99, 235, 0.1)',
                              color: 'var(--accent-blue)',
                            }}
                          >
                            {confidencePct}% confidence
                          </span>
                        )}
                      </div>

                      <span className="text-muted">
                        {n.lastObservedAt ? new Date(n.lastObservedAt).toLocaleDateString() : ''}
                      </span>
                    </div>

                    <div className="mb-3">
                      <span
                        className="text-xs font-bold uppercase px-2 py-0.5 rounded inline-block mb-1"
                        style={{
                          backgroundColor: 'rgba(37, 99, 235, 0.12)',
                          color: 'var(--accent-blue)',
                        }}
                      >
                        Narrative Statement
                      </span>
                      <h3 className="text-lg font-bold leading-snug m-0" style={{ color: 'var(--text-primary)' }}>
                        &ldquo;{n.description}&rdquo;
                      </h3>
                    </div>

                    {n.recommendation && (
                      <div
                        className="rounded-lg p-3 mb-3 border text-xs"
                        style={{
                          background: 'rgba(16, 185, 129, 0.05)',
                          borderColor: 'rgba(16, 185, 129, 0.25)',
                          borderLeft: '3px solid #10b981',
                        }}
                      >
                        <div className="flex items-center gap-1 font-semibold mb-1 uppercase" style={{ color: '#059669' }}>
                          <Lightbulb size={12} />
                          <span>Actionable Recommendation</span>
                        </div>
                        <p className="m-0 italic text-secondary leading-relaxed">
                          &ldquo;{n.recommendation}&rdquo;
                        </p>
                      </div>
                    )}

                    {/* Expandable Evidence & Supporting Claims Details */}
                    {isExpanded && (
                      <div
                        className="p-4 rounded-xl border mb-3 space-y-3 text-xs"
                        style={{
                          background: 'var(--surface-color-soft)',
                        }}
                      >
                        <div>
                          <div className="font-bold uppercase text-muted mb-1">
                            Intelligence Brief
                          </div>
                          <p className="m-0 text-secondary leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>
                            {n.intelligence || 'No detailed intelligence brief recorded.'}
                          </p>
                        </div>

                        <div>
                          <div className="font-bold uppercase text-muted mb-1">
                            Supporting Sources ({sourcesList.length})
                          </div>
                          {sourcesList.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {sourcesList.map((src, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded-md font-semibold border"
                                  style={{
                                    background: 'var(--surface-color-strong)',
                                    color: 'var(--text-primary)',
                                  }}
                                >
                                  {src}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted">No specific sources recorded.</span>
                          )}
                        </div>

                        <div>
                          <span className="font-bold uppercase text-muted">
                            Supporting Claims ({claimCount}):{' '}
                          </span>
                          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {claimIdsList.length > 0
                              ? `${claimIdsList.length} linked claims (${claimIdsList.slice(0, 5).join(', ')}${claimIdsList.length > 5 ? '...' : ''})`
                              : `${claimCount} synthesized supporting claims`}
                          </span>
                        </div>
                      </div>
                    )}

                    <div
                      className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t text-xs"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <div className="flex items-center gap-4 flex-wrap font-semibold">
                        <span className="flex items-center gap-1">
                          <TrendingUp size={13} />
                          {n.trend || n.analysis?.trend || 'Insufficient Data'}
                        </span>
                        <span>
                          <strong>{claimCount}</strong> {claimCount === 1 ? 'claim' : 'claims'}
                        </span>
                        <span>
                          <strong>{sourceCount}</strong> {sourceCount === 1 ? 'source' : 'sources'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleExpand(narKey)}
                          className="btn btn-secondary btn-sm flex items-center gap-1"
                        >
                          {isExpanded ? (
                            <>
                              <span>Hide Evidence</span>
                              <ChevronUp size={13} />
                            </>
                          ) : (
                            <>
                              <span>Supporting Evidence</span>
                              <ChevronDown size={13} />
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => openFullAnalytics(n)}
                          className="btn btn-primary btn-sm flex items-center gap-1 font-semibold"
                        >
                          <span>Full Analytics</span>
                          <ArrowRight size={13} />
                        </button>
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

export default Narratives;
