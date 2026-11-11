import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  LayoutGrid,
  Building2,
  ArrowLeft,
  ArrowRight,
  Database,
  Layers,
  Bookmark,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  FileText,
  Lightbulb,
  ChevronRight,
  X,
  Loader2,
  Folder,
  Network,
} from 'lucide-react';
import { useEntity } from '../context/EntityContext';
import api, {
  fetchDomains,
  fetchEntityStats,
  fetchEntityNarratives,
  fetchEntityHighlights,
  fetchEntityTopics,
  toArray,
} from '../services/api';
import HighlightCard, {
  selectHighlightNarratives,
  computeNarrativeSummaryMetrics,
  normalizeTopicName,
  getHighlightClassificationMeta,
} from '../components/HighlightCard';
import TrendGraph from '../components/TrendGraph';

const Overview = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { entities, changeEntity, loading: entitiesLoading } = useEntity();

  const [domains, setDomains] = useState([]);
  const [domainsLoading, setDomainsLoading] = useState(true);

  // Drill-down route params:
  // View 1: domainParam === null
  // View 2: domainParam !== null && entityParam === null
  // View 3: domainParam !== null && entityParam !== null
  const domainParam = searchParams.get('domain');
  const entityParam = searchParams.get('entity');

  // View 3 Dashboard Data State
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [entityStats, setEntityStats] = useState(null);
  const [narratives, setNarratives] = useState([]);
  const [highlights, setHighlights] = useState({ negative: [], positive: [] });
  const [topics, setTopics] = useState([]);
  const [modalNarrative, setModalNarrative] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setDomainsLoading(true);
    fetchDomains()
      .then((list) => {
        if (!cancelled) setDomains(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        console.error('Failed to fetch domains:', err);
        if (!cancelled) setDomains([]);
      })
      .finally(() => {
        if (!cancelled) setDomainsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Build Domain metadata & Entities grouped strictly by Domain
  const { domainCards, entitiesByDomain } = useMemo(() => {
    const safeEntities = Array.isArray(entities) ? entities : [];
    const safeDomains = Array.isArray(domains) ? domains : [];
    const map = {};

    safeDomains.forEach((d) => {
      const name = typeof d === 'string' ? d : d?.name;
      if (!name) return;
      map[name] = {
        name,
        description: d?.description || `${name} Intelligence Domain`,
        entities: [],
      };
    });

    safeEntities.forEach((entity) => {
      if (!entity) return;
      const domName = entity.domain || 'General';
      if (!map[domName]) {
        map[domName] = {
          name: domName,
          description: `${domName} Intelligence Domain`,
          entities: [],
        };
      }
      map[domName].entities.push(entity);
    });

    const sortedCards = Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
    return {
      domainCards: sortedCards,
      entitiesByDomain: map,
    };
  }, [domains, entities]);

  const selectedDomainObj = useMemo(() => {
    if (!domainParam) return null;
    return entitiesByDomain[domainParam] || {
      name: domainParam,
      description: `${domainParam} Intelligence Domain`,
      entities: [],
    };
  }, [domainParam, entitiesByDomain]);

  const activeViewEntity = useMemo(() => {
    if (!entityParam) return null;
    const safeEntities = Array.isArray(entities) ? entities : [];
    return safeEntities.find((e) => e.entityId === entityParam) || null;
  }, [entityParam, entities]);

  // Sync URL-selected entity into global EntityContext cleanly
  useEffect(() => {
    if (activeViewEntity) {
      changeEntity(activeViewEntity.entityId, false);
    }
  }, [activeViewEntity?.entityId]);

  // Fetch View 3 stats, highlights, topics & narratives when entering View 3
  useEffect(() => {
    if (!activeViewEntity?.entityId) {
      setEntityStats(null);
      setNarratives([]);
      setHighlights({ negative: [], positive: [] });
      setTopics([]);
      return;
    }

    let cancelled = false;
    const loadDashboard = async () => {
      setDashboardLoading(true);
      try {
        const eid = activeViewEntity.entityId;
        const [statsData, narList, hlData, topicList] = await Promise.all([
          fetchEntityStats(eid).catch(() => null),
          fetchEntityNarratives(eid).catch(() => []),
          fetchEntityHighlights(eid).catch(() => ({ negative: [], positive: [] })),
          fetchEntityTopics(eid).catch(() => []),
        ]);
        if (cancelled) return;
        setEntityStats(statsData);
        setNarratives(Array.isArray(narList) ? narList : []);
        setHighlights({
          negative: Array.isArray(hlData?.negative) ? hlData.negative : [],
          positive: Array.isArray(hlData?.positive) ? hlData.positive : [],
        });
        setTopics(Array.isArray(topicList) ? topicList : []);
      } catch (err) {
        console.error('Error loading entity dashboard:', err);
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    };

    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [activeViewEntity?.entityId]);

  // Modal Escape key + body scroll lock
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setModalNarrative(null);
    };
    if (modalNarrative) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [modalNarrative]);

  // Navigation Handlers for Strict 3-Step Drill-Down
  const goToDomains = () => {
    setModalNarrative(null);
    setSearchParams({});
  };

  const goToEntitiesInDomain = (domainName) => {
    setModalNarrative(null);
    setSearchParams({ domain: domainName });
  };

  const goToEntityDashboard = (entity) => {
    if (!entity) return;
    changeEntity(entity.entityId, false);
    setSearchParams({
      domain: entity.domain || domainParam || 'General',
      entity: entity.entityId,
    });
  };

  const openNarrativeModal = (nar) => {
    if (!nar) return;
    setModalNarrative(nar);
    if (nar._id) {
      api.get(`/narratives/${nar._id}`)
        .then((res) => {
          if (res.data && typeof res.data === 'object') {
            setModalNarrative((prev) => (prev && prev._id === nar._id ? res.data : prev));
          }
        })
        .catch(() => {});
    }
  };

  // Compute View 3 KPIs and Topic/Sentiment summaries
  const dashboardMetrics = useMemo(() => {
    const summary = computeNarrativeSummaryMetrics(narratives);
    const eligible = (Array.isArray(narratives) ? narratives : []).filter(
      (n) => n && n.isEligibleForDisplay !== false && n.displayStatus !== 'candidate'
    );

    let negativeCount = 0;
    let mixedCount = 0;
    const topicCounts = {};

    eligible.forEach((n) => {
      const dir = n.direction || 'neutral';
      if (dir === 'negative') negativeCount += 1;
      else if (dir === 'mixed') mixedCount += 1;

      const cleanTopic = normalizeTopicName(n.topic, activeViewEntity?.name || '');
      topicCounts[cleanTopic] = (topicCounts[cleanTopic] || 0) + 1;
    });

    const topicDistribution = Object.entries(topicCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const activeTopicsCount = Math.max(
      topicDistribution.length,
      Array.isArray(topics) ? topics.length : 0,
      Number(entityStats?.topicCount ?? 0)
    );

    const totalNarrativesCount = eligible.length || Number(entityStats?.totalNarratives ?? 0);

    return {
      totalDocuments: Number(entityStats?.totalDocuments ?? 0),
      processedDocuments: Number(entityStats?.processedDocuments ?? 0),
      activeSources: Number(entityStats?.activeSources ?? 0),
      totalNarratives: totalNarrativesCount,
      activeTopicsCount,
      criticalCount: Math.max(summary.criticalEscalation, Number(entityStats?.criticalCount ?? 0)),
      sentiment: {
        positive: summary.positive,
        neutral: summary.neutral,
        negative: negativeCount,
        mixed: mixedCount,
      },
      topicDistribution,
    };
  }, [narratives, topics, entityStats, activeViewEntity?.name]);

  // Fallback attention arrays from narratives if backend highlights came back empty
  const negativeAttentionList = useMemo(() => {
    if (highlights.negative.length > 0) return highlights.negative;
    return (Array.isArray(narratives) ? narratives : [])
      .filter(
        (n) =>
          n &&
          n.isEligibleForDisplay !== false &&
          n.direction === 'negative' &&
          ['critical', 'high', 'medium'].includes(n.priority)
      )
      .slice(0, 5);
  }, [highlights.negative, narratives]);

  const positiveHighlightsList = useMemo(() => {
    if (highlights.positive.length > 0) return highlights.positive;
    return (Array.isArray(narratives) ? narratives : [])
      .filter((n) => n && n.isEligibleForDisplay !== false && n.direction === 'positive')
      .slice(0, 3);
  }, [highlights.positive, narratives]);

  const dominantNarratives = useMemo(
    () => selectHighlightNarratives(narratives, 6),
    [narratives]
  );

  if (entitiesLoading || domainsLoading) {
    return (
      <div className="p-8 flex items-center gap-2 text-secondary">
        <Loader2 size={18} className="animate-spin" />
        <span>Loading intelligence domains...</span>
      </div>
    );
  }

  // ============================================================================
  // VIEW 1: DOMAIN SELECTION GRID (domainParam === null)
  // ============================================================================
  if (!domainParam) {
    return (
      <div className="max-w-6xl mx-auto p-6 pb-12">
        <div className="mb-8">
          <span
            className="text-xs font-bold uppercase px-3 py-1 rounded-full inline-block mb-3"
            style={{
              background: 'rgba(37, 99, 235, 0.12)',
              color: 'var(--accent-blue)',
              letterSpacing: '0.06em',
            }}
          >
            Step 1 of 3 · Domain Selection
          </span>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
            Intelligence Domains
          </h1>
          <p className="text-secondary m-0" style={{ fontSize: '1.05rem' }}>
            Select an industry or sector domain below to explore tracked workspaces and organizations.
          </p>
        </div>

        {domainCards.length === 0 ? (
          <div className="card text-center py-12">
            <LayoutGrid size={40} className="mx-auto mb-3 text-muted" style={{ opacity: 0.6 }} />
            <h3 className="text-secondary mb-1">No Domains Available</h3>
            <p className="text-muted text-sm m-0">
              No intelligence domains or entities have been configured yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {domainCards.map((dom) => {
              const count = dom.entities.length;
              return (
                <div
                  key={dom.name}
                  role="button"
                  tabIndex={0}
                  onClick={() => goToEntitiesInDomain(dom.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      goToEntitiesInDomain(dom.name);
                    }
                  }}
                  className="card cursor-pointer flex flex-col justify-between transition-all"
                  style={{ padding: '1.5rem' }}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div
                        className="p-3 rounded-xl shrink-0"
                        style={{
                          background: 'rgba(37, 99, 235, 0.1)',
                          color: 'var(--accent-blue)',
                        }}
                      >
                        <LayoutGrid size={24} />
                      </div>
                      <span
                        className="badge-info"
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        {count} {count === 1 ? 'Entity' : 'Entities'}
                      </span>
                    </div>

                    <h2
                      style={{
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        marginBottom: '0.4rem',
                      }}
                    >
                      {dom.name}
                    </h2>
                    <p className="text-secondary text-sm m-0 line-clamp-2">
                      {dom.description}
                    </p>
                  </div>

                  <div
                    className="mt-6 pt-4 border-t flex items-center justify-between text-sm font-semibold"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--accent-blue)' }}
                  >
                    <span>Explore Workspaces</span>
                    <ArrowRight size={16} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // VIEW 2: ENTITIES IN SELECTED DOMAIN (domainParam !== null && entityParam === null)
  // ============================================================================
  if (!activeViewEntity) {
    const domainEntities = selectedDomainObj?.entities || [];

    return (
      <div className="max-w-6xl mx-auto p-6 pb-12">
        {/* Back & Domain Breadcrumb Bar */}
        <div
          className="card mb-6 flex items-center justify-between flex-wrap gap-4"
          style={{ padding: '1rem 1.35rem', borderRadius: '16px' }}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={goToDomains}
              className="btn btn-secondary btn-sm flex items-center gap-2"
            >
              <ArrowLeft size={15} />
              <span>Back to All Domains</span>
            </button>

            <span className="text-muted">|</span>

            <div className="flex items-center gap-2">
              <Folder size={18} style={{ color: 'var(--accent-blue)' }} />
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                Domain: {selectedDomainObj?.name}
              </span>
              <span className="badge-info">
                {domainEntities.length} {domainEntities.length === 1 ? 'Workspace' : 'Workspaces'}
              </span>
            </div>
          </div>

          <span
            className="text-xs font-bold uppercase px-3 py-1 rounded-full"
            style={{
              background: 'rgba(37, 99, 235, 0.1)',
              color: 'var(--accent-blue)',
            }}
          >
            Step 2 of 3 · Select Entity
          </span>
        </div>

        <div className="mb-6">
          <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
            {selectedDomainObj?.name} Workspaces
          </h1>
          <p className="text-secondary m-0" style={{ fontSize: '0.98rem' }}>
            Select an entity card to inspect processed documents, intelligence metrics, and narrative highlights.
          </p>
        </div>

        {domainEntities.length === 0 ? (
          <div className="card text-center py-12">
            <Building2 size={40} className="mx-auto mb-3 text-muted" style={{ opacity: 0.6 }} />
            <h3 className="text-secondary mb-1">No Entities in {selectedDomainObj?.name}</h3>
            <p className="text-muted text-sm mb-4">
              No workspaces have been added to this domain yet.
            </p>
            <button type="button" onClick={goToDomains} className="btn btn-primary btn-sm">
              Choose Another Domain
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {domainEntities.map((entity) => {
              const aliases = Array.isArray(entity.aliases) ? entity.aliases.filter(Boolean) : [];
              return (
                <div
                  key={entity.entityId}
                  role="button"
                  tabIndex={0}
                  onClick={() => goToEntityDashboard(entity)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      goToEntityDashboard(entity);
                    }
                  }}
                  className="card cursor-pointer flex flex-col justify-between transition-all"
                  style={{ padding: '1.4rem' }}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div
                        className="p-2.5 rounded-xl shrink-0"
                        style={{
                          background: 'rgba(37, 99, 235, 0.1)',
                          color: 'var(--accent-blue)',
                        }}
                      >
                        <Building2 size={20} />
                      </div>

                      {entity.entityType && (
                        <span className="badge-outline">
                          {entity.entityType}
                        </span>
                      )}
                    </div>

                    <h2
                      className="truncate"
                      title={entity.name}
                      style={{
                        fontSize: '1.2rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        marginBottom: '0.35rem',
                      }}
                    >
                      {entity.name}
                    </h2>

                    <p className="text-secondary text-sm m-0 line-clamp-2">
                      {entity.description || `Tracked ${entity.entityType || 'workspace'} in ${selectedDomainObj?.name}`}
                    </p>

                    {aliases.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {aliases.slice(0, 3).map((alias, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded text-xs"
                            style={{
                              background: 'var(--surface-color-soft)',
                              color: 'var(--text-secondary)',
                              border: '1px solid var(--border-color)',
                            }}
                          >
                            {alias}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div
                    className="mt-6 pt-4 border-t flex items-center justify-between text-sm font-semibold"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--accent-blue)' }}
                  >
                    <span>Open Dashboard</span>
                    <ArrowRight size={16} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // VIEW 3: ENTITY INTELLIGENCE DASHBOARD (activeViewEntity !== null)
  // ============================================================================
  const entityDomain = activeViewEntity.domain || domainParam || 'General';
  const maxTopicCount = dashboardMetrics.topicDistribution[0]?.count || 1;

  return (
    <div className="max-w-6xl mx-auto p-6 pb-12">
      {/* Top Breadcrumb & Navigation Actions */}
      <div
        className="card mb-6 flex items-center justify-between flex-wrap gap-4"
        style={{ padding: '1rem 1.35rem', borderRadius: '16px' }}
      >
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <button
            type="button"
            onClick={goToDomains}
            className="font-semibold cursor-pointer bg-transparent p-0"
            style={{ border: 'none', color: 'var(--accent-blue)' }}
          >
            All Domains
          </button>
          <span className="text-muted">/</span>
          <button
            type="button"
            onClick={() => goToEntitiesInDomain(entityDomain)}
            className="font-semibold cursor-pointer bg-transparent p-0"
            style={{ border: 'none', color: 'var(--accent-blue)' }}
          >
            {entityDomain}
          </button>
          <span className="text-muted">/</span>
          <strong style={{ color: 'var(--text-primary)' }}>{activeViewEntity.name}</strong>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => goToEntitiesInDomain(entityDomain)}
            className="btn btn-secondary btn-sm"
          >
            Change Entity
          </button>
          <button
            type="button"
            onClick={goToDomains}
            className="btn btn-secondary btn-sm"
          >
            Change Domain
          </button>
          <button
            type="button"
            onClick={() => navigate('/narratives')}
            className="btn btn-primary btn-sm flex items-center gap-1"
          >
            <span>View All Narratives</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Entity Dashboard Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {activeViewEntity.name} Intelligence Dashboard
          </h1>
          {activeViewEntity.entityType && (
            <span className="badge-info">{activeViewEntity.entityType}</span>
          )}
        </div>
        <p className="text-secondary m-0 text-sm">
          Operational metrics, topic synthesis, and high-impact narrative highlights for {activeViewEntity.name}.
        </p>
      </div>

      {dashboardLoading ? (
        <div className="card p-10 flex items-center justify-center gap-2 text-secondary text-sm">
          <Loader2 size={18} className="animate-spin" />
          <span>Loading metrics and highlights for {activeViewEntity.name}...</span>
        </div>
      ) : (
        <>
          {/* ROW 1 — 4 Key KPI Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="metric-card-horizontal">
              <div
                className="metric-icon-wrap"
                style={{ background: 'rgba(37, 99, 235, 0.12)', color: 'var(--accent-blue)' }}
              >
                <Database size={20} />
              </div>
              <div className="metric-body">
                <span className="metric-label">Documents Processed</span>
                <div className="metric-num-row">
                  <span className="metric-num">{dashboardMetrics.processedDocuments}</span>
                  <span className="metric-sub">/ {dashboardMetrics.totalDocuments} records</span>
                </div>
              </div>
            </div>

            <div className="metric-card-horizontal">
              <div
                className="metric-icon-wrap"
                style={{ background: 'rgba(124, 58, 237, 0.12)', color: 'var(--accent-purple)' }}
              >
                <Layers size={20} />
              </div>
              <div className="metric-body">
                <span className="metric-label">Total Narratives</span>
                <div className="metric-num-row">
                  <span className="metric-num">{dashboardMetrics.totalNarratives}</span>
                  <span className="metric-sub">{dashboardMetrics.activeSources} sources</span>
                </div>
              </div>
            </div>

            <div className="metric-card-horizontal">
              <div
                className="metric-icon-wrap"
                style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#059669' }}
              >
                <Bookmark size={20} />
              </div>
              <div className="metric-body">
                <span className="metric-label">Active Topics</span>
                <div className="metric-num-row">
                  <span className="metric-num">{dashboardMetrics.activeTopicsCount}</span>
                  <span className="metric-sub">themes</span>
                </div>
              </div>
            </div>

            <div className="metric-card-horizontal">
              <div
                className="metric-icon-wrap"
                style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' }}
              >
                <AlertTriangle size={20} />
              </div>
              <div className="metric-body">
                <span className="metric-label">Critical / Escalation</span>
                <div className="metric-num-row">
                  <span className="metric-num" style={{ color: '#ef4444' }}>
                    {dashboardMetrics.criticalCount}
                  </span>
                  <span className="metric-sub">
                    {dashboardMetrics.sentiment.positive}+ / {dashboardMetrics.sentiment.neutral}~ / {dashboardMetrics.sentiment.negative}-
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ROW 2 — Dashboard Highlights (Admin-matched sections + Topic/Sentiment Overview) */}
          <div className="space-y-6">
            {/* Topic Distribution & Sentiment Overview Row */}
            {dashboardMetrics.totalNarratives > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card p-5">
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <Bookmark size={16} style={{ color: 'var(--accent-blue)' }} />
                    <span>Topic Distribution</span>
                  </h3>
                  {dashboardMetrics.topicDistribution.length === 0 ? (
                    <p className="text-xs text-muted m-0">No normalized topics found yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {dashboardMetrics.topicDistribution.slice(0, 5).map((t) => (
                        <div key={t.name}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                              {t.name}
                            </span>
                            <span className="text-muted font-semibold">{t.count}</span>
                          </div>
                          <div
                            className="w-full rounded-full"
                            style={{
                              height: '6px',
                              background: 'var(--surface-color-soft)',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.max(10, Math.round((t.count / maxTopicCount) * 100))}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, var(--accent-blue), var(--accent-purple))',
                                borderRadius: '9999px',
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="card p-5">
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <Network size={16} style={{ color: 'var(--accent-purple)' }} />
                    <span>Sentiment Breakdown</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl border" style={{ background: 'var(--surface-color-soft)' }}>
                      <div className="text-xs text-muted font-semibold">Positive / Praise</div>
                      <div className="text-lg font-bold" style={{ color: '#059669' }}>
                        {dashboardMetrics.sentiment.positive}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl border" style={{ background: 'var(--surface-color-soft)' }}>
                      <div className="text-xs text-muted font-semibold">Critical / Negative</div>
                      <div className="text-lg font-bold" style={{ color: '#ef4444' }}>
                        {dashboardMetrics.sentiment.negative}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl border" style={{ background: 'var(--surface-color-soft)' }}>
                      <div className="text-xs text-muted font-semibold">Neutral Observation</div>
                      <div className="text-lg font-bold" style={{ color: 'var(--text-secondary)' }}>
                        {dashboardMetrics.sentiment.neutral}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl border" style={{ background: 'var(--surface-color-soft)' }}>
                      <div className="text-xs text-muted font-semibold">Mixed Perspective</div>
                      <div className="text-lg font-bold" style={{ color: 'var(--accent-purple)' }}>
                        {dashboardMetrics.sentiment.mixed}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Admin Highlight Section 1: Negative Narratives Requiring Attention */}
            <div>
              <div
                className="flex items-center justify-between mb-3 pb-2 border-b"
                style={{ borderColor: 'var(--border-color)' }}
              >
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2 m-0" style={{ color: 'var(--text-primary)' }}>
                    <AlertTriangle size={18} style={{ color: '#f59e0b' }} />
                    <span>Negative Narratives Requiring Attention</span>
                  </h2>
                  <p className="text-secondary text-xs m-0 mt-1">
                    High-priority issues, escalations, and recurring concerns prioritized for review.
                  </p>
                </div>
                <span className="badge-outline">
                  {negativeAttentionList.length} {negativeAttentionList.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              {negativeAttentionList.length === 0 ? (
                <div
                  className="card p-6 text-center text-secondary text-sm"
                  style={{ background: 'var(--surface-color-soft)' }}
                >
                  No critical or high-priority negative narratives detected for {activeViewEntity.name}.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {negativeAttentionList.map((nar) => {
                    const meta = getHighlightClassificationMeta(nar);
                    return (
                      <div
                        key={nar._id || nar.narrativeId}
                        role="button"
                        tabIndex={0}
                        onClick={() => openNarrativeModal(nar)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openNarrativeModal(nar);
                          }
                        }}
                        className="card cursor-pointer flex flex-col justify-between transition-all"
                        style={{
                          borderLeft: `4px solid ${meta.borderColor}`,
                          padding: '1.2rem',
                        }}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 flex-wrap mb-3 text-xs">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span
                                className="font-semibold px-2 py-0.5 rounded-md"
                                style={{ background: 'var(--surface-color-soft)', color: 'var(--text-secondary)' }}
                              >
                                {normalizeTopicName(nar.topic, activeViewEntity.name)}
                              </span>
                              <span
                                className="font-semibold px-2 py-0.5 rounded-md"
                                style={{ background: meta.badgeBg, color: meta.badgeColor }}
                              >
                                {meta.label}
                              </span>
                            </div>
                            <span className="text-muted">
                              {nar.lastObservedAt ? new Date(nar.lastObservedAt).toLocaleDateString() : ''}
                            </span>
                          </div>

                          <h3 className="text-sm font-bold leading-snug mb-3" style={{ color: 'var(--text-primary)' }}>
                            &ldquo;{nar.description}&rdquo;
                          </h3>

                          {nar.recommendation && (
                            <div
                              className="rounded-lg p-2 mb-3 border text-xs"
                              style={{
                                background: 'rgba(16, 185, 129, 0.06)',
                                borderColor: 'rgba(16, 185, 129, 0.25)',
                                borderLeft: '3px solid #10b981',
                              }}
                            >
                              <div className="flex items-center gap-1 font-semibold mb-1" style={{ color: '#059669' }}>
                                <Lightbulb size={12} />
                                <span>Recommendation</span>
                              </div>
                              <p className="m-0 italic text-secondary line-clamp-2">
                                &ldquo;{nar.recommendation}&rdquo;
                              </p>
                            </div>
                          )}
                        </div>

                        <div
                          className="border-t pt-3 mt-2 flex items-center justify-between text-xs text-secondary font-semibold"
                          style={{ borderColor: 'var(--border-color)' }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <Layers size={12} /> {nar.analysis?.claim_count ?? 0}
                            </span>
                            <span className="flex items-center gap-1">
                              <FileText size={12} /> {nar.analysis?.source_count ?? toArray(nar.supportingEvidence, 'sources').length}
                            </span>
                            <span className="flex items-center gap-1">
                              <TrendingUp size={12} /> {nar.trend || nar.analysis?.trend || 'Stable'}
                            </span>
                          </div>
                          <span className="flex items-center gap-1" style={{ color: meta.badgeColor }}>
                            Details <ChevronRight size={13} />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Admin Highlight Section 2: Positive Institutional Highlights */}
            <div>
              <div
                className="flex items-center justify-between mb-3 pb-2 border-b"
                style={{ borderColor: 'var(--border-color)' }}
              >
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2 m-0" style={{ color: 'var(--text-primary)' }}>
                    <Sparkles size={18} style={{ color: '#10b981' }} />
                    <span>Positive Highlights &amp; Core Strengths</span>
                  </h2>
                  <p className="text-secondary text-xs m-0 mt-1">
                    Standout achievements, praise signals, and verified institutional strengths.
                  </p>
                </div>
                <span className="badge-outline">
                  {positiveHighlightsList.length} {positiveHighlightsList.length === 1 ? 'highlight' : 'highlights'}
                </span>
              </div>

              {positiveHighlightsList.length === 0 ? (
                <div
                  className="card p-6 text-center text-secondary text-sm"
                  style={{ background: 'var(--surface-color-soft)' }}
                >
                  No major positive highlights recorded yet for {activeViewEntity.name}.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {positiveHighlightsList.map((nar) => {
                    const meta = getHighlightClassificationMeta(nar);
                    return (
                      <div
                        key={nar._id || nar.narrativeId}
                        role="button"
                        tabIndex={0}
                        onClick={() => openNarrativeModal(nar)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openNarrativeModal(nar);
                          }
                        }}
                        className="card cursor-pointer flex flex-col justify-between transition-all"
                        style={{
                          borderLeft: `4px solid ${meta.borderColor}`,
                          padding: '1.2rem',
                        }}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 flex-wrap mb-3 text-xs">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span
                                className="font-semibold px-2 py-0.5 rounded-md"
                                style={{ background: 'var(--surface-color-soft)', color: 'var(--text-secondary)' }}
                              >
                                {normalizeTopicName(nar.topic, activeViewEntity.name)}
                              </span>
                              <span
                                className="font-semibold px-2 py-0.5 rounded-md"
                                style={{ background: meta.badgeBg, color: meta.badgeColor }}
                              >
                                {meta.label}
                              </span>
                            </div>
                            <span className="text-muted">
                              {nar.lastObservedAt ? new Date(nar.lastObservedAt).toLocaleDateString() : ''}
                            </span>
                          </div>

                          <h3 className="text-sm font-bold leading-snug mb-3" style={{ color: 'var(--text-primary)' }}>
                            &ldquo;{nar.description}&rdquo;
                          </h3>
                        </div>

                        <div
                          className="border-t pt-3 mt-2 flex items-center justify-between text-xs text-secondary font-semibold"
                          style={{ borderColor: 'var(--border-color)' }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <Layers size={12} /> {nar.analysis?.claim_count ?? 0}
                            </span>
                            <span className="flex items-center gap-1">
                              <FileText size={12} /> {nar.analysis?.source_count ?? toArray(nar.supportingEvidence, 'sources').length}
                            </span>
                            <span className="flex items-center gap-1">
                              <TrendingUp size={12} /> {nar.trend || nar.analysis?.trend || 'Stable'}
                            </span>
                          </div>
                          <span className="flex items-center gap-1" style={{ color: meta.badgeColor }}>
                            Details <ChevronRight size={13} />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Section 3: Top High-Impact / Dominant Narratives */}
            <div>
              <div
                className="flex items-center justify-between flex-wrap gap-2 mb-3 pb-2 border-b"
                style={{ borderColor: 'var(--border-color)' }}
              >
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2 m-0" style={{ color: 'var(--text-primary)' }}>
                    <Network size={18} style={{ color: 'var(--accent-blue)' }} />
                    <span>Top High-Impact &amp; Dominant Narratives</span>
                  </h2>
                  <p className="text-secondary text-xs m-0 mt-1">
                    Ranked by evidence strength, claim volume, and priority impact score.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => navigate('/narratives')}
                  className="text-xs font-semibold flex items-center gap-1 cursor-pointer bg-transparent p-0"
                  style={{ border: 'none', color: 'var(--accent-blue)' }}
                >
                  <span>View All Narratives</span>
                  <ArrowRight size={14} />
                </button>
              </div>

              {dominantNarratives.length === 0 ? (
                <div
                  className="card p-8 text-center text-secondary"
                  style={{ background: 'var(--surface-color-soft)' }}
                >
                  <Network size={36} className="mx-auto mb-2 text-muted" style={{ opacity: 0.65 }} />
                  <p className="font-semibold text-sm m-0" style={{ color: 'var(--text-primary)' }}>
                    No processed narratives found for {activeViewEntity.name} yet.
                  </p>
                  <p className="text-xs text-muted mt-1 m-0">
                    Ingest documents and run the AI pipeline in Admin to generate narrative intelligence.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {dominantNarratives.map((nar) => (
                    <HighlightCard
                      key={nar._id || nar.narrativeId}
                      narrative={nar}
                      entityName={activeViewEntity.name}
                      onSelect={(item) => openNarrativeModal(item)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Narrative Detail Modal (Admin-matched inspection dialog) */}
      {modalNarrative && (() => {
        const modalMeta = getHighlightClassificationMeta(modalNarrative);
        const modalSources = toArray(modalNarrative.supportingEvidence, 'sources');
        const currentTrend = modalNarrative.trend || modalNarrative.analysis?.trend || 'Insufficient Data';
        const timelineData =
          modalNarrative.timeline || modalNarrative.analysis?.temporal_information?.timeline || [];

        return (
          <div
            role="dialog"
            aria-modal="true"
            className="modal-backdrop-solid"
            onClick={() => setModalNarrative(null)}
          >
            <div className="modal-dialog-solid" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-solid flex-col" style={{ alignItems: 'stretch' }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="px-2.5 py-0.5 rounded-md text-xs font-semibold"
                      style={{ background: 'var(--surface-color-soft)', color: 'var(--text-secondary)' }}
                    >
                      {normalizeTopicName(modalNarrative.topic, activeViewEntity.name)}
                    </span>
                    <span
                      className="px-2.5 py-0.5 rounded-md text-xs font-semibold"
                      style={{ background: modalMeta.badgeBg, color: modalMeta.badgeColor }}
                    >
                      {modalMeta.label}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalNarrative(null)}
                    aria-label="Close details"
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '0.35rem' }}
                  >
                    <X size={18} />
                  </button>
                </div>

                <div
                  className="rounded-xl p-4 border mt-2"
                  style={{
                    background: 'rgba(37, 99, 235, 0.07)',
                    borderColor: 'rgba(59, 130, 246, 0.3)',
                    borderLeft: '4px solid var(--accent-blue)',
                  }}
                >
                  <div className="text-xs font-bold uppercase mb-1" style={{ color: 'var(--accent-blue)' }}>
                    Narrative Statement
                  </div>
                  <p className="text-lg font-bold m-0" style={{ color: 'var(--text-primary)' }}>
                    &ldquo;{modalNarrative.description}&rdquo;
                  </p>
                </div>
              </div>

              <div className="modal-body-scrollable">
                {modalNarrative.classificationReason && (
                  <div className="p-3 rounded-xl border text-xs" style={{ background: 'var(--surface-color-soft)' }}>
                    <div className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                      Classification Context &amp; Impact
                    </div>
                    <p className="m-0 text-secondary leading-relaxed">{modalNarrative.classificationReason}</p>
                  </div>
                )}

                <div
                  className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl border"
                  style={{ background: 'var(--surface-color-soft)' }}
                >
                  <div>
                    <span className="text-secondary text-xs font-semibold block">Claim Count</span>
                    <strong className="text-lg">{modalNarrative.analysis?.claim_count ?? 0}</strong>
                  </div>
                  <div>
                    <span className="text-secondary text-xs font-semibold block">Source Count</span>
                    <strong className="text-lg">
                      {modalNarrative.analysis?.source_count ?? modalSources.length}
                    </strong>
                  </div>
                  <div>
                    <span className="text-secondary text-xs font-semibold block">Trend</span>
                    <strong className="text-sm">{currentTrend}</strong>
                  </div>
                  <div>
                    <span className="text-secondary text-xs font-semibold block">Last Observed</span>
                    <strong className="text-sm">
                      {modalNarrative.lastObservedAt
                        ? new Date(modalNarrative.lastObservedAt).toLocaleDateString()
                        : 'N/A'}
                    </strong>
                  </div>
                </div>

                <div className="rounded-xl border p-2">
                  <TrendGraph
                    timeline={timelineData}
                    trend={currentTrend}
                    title="Evidence Velocity & Temporal Activity"
                  />
                </div>

                {modalNarrative.recommendation && (
                  <div
                    className="p-4 rounded-xl border"
                    style={{
                      background: 'rgba(16, 185, 129, 0.08)',
                      borderColor: 'rgba(16, 185, 129, 0.35)',
                      borderLeft: '4px solid #10b981',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1 font-bold text-xs uppercase" style={{ color: '#059669' }}>
                      <Lightbulb size={14} />
                      <span>Actionable Recommendation</span>
                    </div>
                    <p className="m-0 italic text-sm" style={{ color: 'var(--text-primary)' }}>
                      &ldquo;{modalNarrative.recommendation}&rdquo;
                    </p>
                  </div>
                )}

                <div
                  className="p-4 rounded-xl border"
                  style={{
                    background: 'var(--surface-color-soft)',
                    borderLeft: '4px solid var(--accent-blue)',
                  }}
                >
                  <h4 className="font-bold text-sm mb-2">Executive Intelligence Brief</h4>
                  <p className="text-secondary text-sm m-0 leading-relaxed">
                    {modalNarrative.intelligence || 'No detailed intelligence summary available for this narrative.'}
                  </p>
                </div>

                {modalSources.length > 0 && (
                  <div className="p-4 rounded-xl border">
                    <h4 className="font-bold text-sm mb-2">Supporting Sources ({modalSources.length})</h4>
                    <div className="flex flex-wrap gap-2">
                      {modalSources.map((src, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-0.5 rounded-md text-xs font-semibold border"
                          style={{ background: 'var(--surface-color-soft)' }}
                        >
                          {src}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer-solid">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    const id = modalNarrative._id;
                    setModalNarrative(null);
                    if (id) navigate(`/narratives/${id}`);
                  }}
                >
                  Open Full Narrative View
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setModalNarrative(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Overview;
