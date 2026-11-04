import { useCallback, useEffect, useMemo, useState } from 'react';
import { 
  RefreshCw, 
  Bookmark, 
  Search, 
  TrendingUp, 
  Layers, 
  FileText, 
  X, 
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  EyeOff,
  Lightbulb
} from 'lucide-react';
import { useEntity } from '../context/EntityContext';
import api from '../services/api';
import TrendGraph from '../components/TrendGraph';

const normalizeTopic = (topic, entityName = '') => {
  if (!topic || typeof topic !== 'string' || !topic.trim() || topic.trim().toLowerCase() === 'unknown') {
    return 'General / Unclassified';
  }
  let clean = topic.trim();
  clean = clean.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();

  if (entityName && entityName.toLowerCase() !== 'unknown') {
    const esc = entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clean = clean.replace(new RegExp(`^${esc}\\s*[-–—:|/]?\\s*`, 'i'), '');
    clean = clean.replace(new RegExp(`\\s*[-–—:|/]?\\s*${esc}$`, 'i'), '');

    const parts = entityName.split(/\s+/).filter(p => p.length >= 3);
    for (const p of parts) {
      const escP = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      clean = clean.replace(new RegExp(`^${escP}\\s*[-–—:|/]?\\s*`, 'i'), '');
      clean = clean.replace(new RegExp(`\\s*[-–—:|/]?\\s*${escP}$`, 'i'), '');
    }
  }

  clean = clean.replace(/^[\s\-–—:|/,.#'"]+|[\s\-–—:|/,.#'"]+$/g, '').trim();
  return clean || 'General / Unclassified';
};

const getClassificationMeta = (item) => {
  const dir = item?.direction || 'neutral';
  const pri = item?.priority || 'none';
  const sig = item?.positiveSignificance || 'none';

  if (dir === 'negative') {
    if (pri === 'critical' || item?.isSecurityRisk || item?.severityLevel === 'critical') {
      return {
        label: 'Critical Priority',
        badgeClass: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-900',
        borderColor: '#dc2626',
        color: '#dc2626',
        category: 'negative'
      };
    }
    if (pri === 'high' || item?.severityLevel === 'high') {
      return {
        label: 'High Priority',
        badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200 dark:border-orange-900',
        borderColor: '#ea580c',
        color: '#ea580c',
        category: 'negative'
      };
    }
    if (pri === 'medium') {
      return {
        label: 'Medium Priority',
        badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-900',
        borderColor: '#d97706',
        color: '#d97706',
        category: 'negative'
      };
    }
    return {
      label: 'Low Priority',
      badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
      borderColor: '#64748b',
      color: '#64748b',
      category: 'negative'
    };
  }

  if (dir === 'positive') {
    if (sig === 'significant') {
      return {
        label: 'Significant Highlight',
        badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold',
        borderColor: '#059669',
        color: '#059669',
        category: 'positive'
      };
    }
    if (sig === 'notable') {
      return {
        label: 'Notable Highlight',
        badgeClass: 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-semibold',
        borderColor: '#0d9488',
        color: '#0d9488',
        category: 'positive'
      };
    }
    return {
      label: 'Positive Feedback',
      badgeClass: 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-300 border border-green-200 dark:border-green-800',
      borderColor: '#10b981',
      color: '#10b981',
      category: 'positive'
    };
  }

  if (dir === 'mixed') {
    return {
      label: 'Mixed Perspective',
      badgeClass: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800',
      borderColor: '#6366f1',
      color: '#6366f1',
      category: 'mixed'
    };
  }

  return {
    label: 'Neutral Observation',
    badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
    borderColor: '#94a3b8',
    color: '#64748b',
    category: 'neutral'
  };
};

export default function Narratives() {
  const { selectedEntity } = useEntity();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTopicFilter, setActiveTopicFilter] = useState('All');
  const [activeVisibilityTab, setActiveVisibilityTab] = useState('established'); // 'established' | 'candidates' | 'all'
  const [directionFilter, setDirectionFilter] = useState('all'); // 'all' | 'negative' | 'positive' | 'neutral' | 'mixed'
  const [priorityFilter, setPriorityFilter] = useState('all'); // 'all' | 'critical' | 'high' | 'medium' | 'low'
  const [significanceFilter, setSignificanceFilter] = useState('all'); // 'all' | 'significant' | 'notable' | 'general'
  const [selectedNarrative, setSelectedNarrative] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = selectedEntity ? { entity_id: selectedEntity.entityId } : {};
      const narrativeResponse = await api.get('/admin/narratives', { params });
      setItems(narrativeResponse.data || []);
      setError('');
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load narratives.');
    } finally {
      setLoading(false);
    }
  }, [selectedEntity]);

  useEffect(() => {
    load();
  }, [load]);

  // Lock background scrolling and handle Escape key when detail modal is active
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedNarrative(null);
      }
    };

    if (selectedNarrative) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedNarrative]);

  // Counts for tabs
  const establishedCount = useMemo(() => items.filter(it => it.isEligibleForDisplay !== false && it.displayStatus !== 'candidate').length, [items]);
  const candidateCount = useMemo(() => items.filter(it => it.isEligibleForDisplay === false || it.displayStatus === 'candidate').length, [items]);

  // Tab Filtering (Established vs Candidate low-evidence pool)
  const tabFilteredItems = useMemo(() => {
    if (activeVisibilityTab === 'established') {
      return items.filter(it => it.isEligibleForDisplay !== false && it.displayStatus !== 'candidate');
    }
    if (activeVisibilityTab === 'candidates') {
      return items.filter(it => it.isEligibleForDisplay === false || it.displayStatus === 'candidate');
    }
    return items;
  }, [items, activeVisibilityTab]);

  // Counts calculated on tabFilteredItems for the dynamic filters
  const directionCounts = useMemo(() => {
    const counts = { all: tabFilteredItems.length, negative: 0, positive: 0, neutral: 0, mixed: 0 };
    for (const it of tabFilteredItems) {
      const d = it.direction || 'neutral';
      if (counts[d] !== undefined) counts[d]++;
      else counts.neutral++;
    }
    return counts;
  }, [tabFilteredItems]);

  const priorityCounts = useMemo(() => {
    const counts = { all: 0, critical: 0, high: 0, medium: 0, low: 0 };
    for (const it of tabFilteredItems) {
      if (it.direction === 'negative') {
        counts.all++;
        const p = it.priority || 'low';
        if (counts[p] !== undefined) counts[p]++;
      }
    }
    return counts;
  }, [tabFilteredItems]);

  const significanceCounts = useMemo(() => {
    const counts = { all: 0, significant: 0, notable: 0, general: 0 };
    for (const it of tabFilteredItems) {
      if (it.direction === 'positive') {
        counts.all++;
        const s = it.positiveSignificance || 'general';
        if (counts[s] !== undefined) counts[s]++;
      }
    }
    return counts;
  }, [tabFilteredItems]);

  // Combined classification, topic, and search filtering
  const filteredItems = useMemo(() => {
    return tabFilteredItems.filter(item => {
      // 1. Direction Filter
      if (directionFilter !== 'all') {
        const itemDir = item.direction || 'neutral';
        if (itemDir !== directionFilter) return false;
      }

      // 2. Priority Filter (for negative narratives)
      if (priorityFilter !== 'all') {
        if (item.direction !== 'negative' || item.priority !== priorityFilter) return false;
      }

      // 3. Significance Filter (for positive narratives)
      if (significanceFilter !== 'all') {
        if (item.direction !== 'positive' || item.positiveSignificance !== significanceFilter) return false;
      }

      // 4. Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const topic = (item.topic || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        const intel = (item.intelligence || '').toLowerCase();
        const rec = (item.recommendation || '').toLowerCase();
        const reason = (item.classificationReason || item.severityReason || '').toLowerCase();
        const indicators = (item.impactIndicators || []).join(' ').toLowerCase();
        const matches = topic.includes(q) || desc.includes(q) || intel.includes(q) || rec.includes(q) || reason.includes(q) || indicators.includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [tabFilteredItems, directionFilter, priorityFilter, significanceFilter, searchQuery]);

  const isFilterActive = directionFilter !== 'all' || priorityFilter !== 'all' || significanceFilter !== 'all' || activeTopicFilter !== 'All' || searchQuery.trim() !== '';

  const clearAllFilters = () => {
    setDirectionFilter('all');
    setPriorityFilter('all');
    setSignificanceFilter('all');
    setActiveTopicFilter('All');
    setSearchQuery('');
  };

  // Group filtered narratives by topic
  const groupedByTopic = useMemo(() => {
    const groups = {};
    for (const item of filteredItems) {
      const topicName = normalizeTopic(item.topic, selectedEntity?.name);
      if (!groups[topicName]) {
        groups[topicName] = [];
      }
      groups[topicName].push(item);
    }
    return groups;
  }, [filteredItems, selectedEntity]);

  const topicNames = useMemo(() => Object.keys(groupedByTopic), [groupedByTopic]);

  const displayedTopics = useMemo(() => {
    if (activeTopicFilter === 'All') return topicNames;
    return topicNames.filter(t => t === activeTopicFilter);
  }, [topicNames, activeTopicFilter]);

  return (
    <section className="w-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Global Narratives
          </h1>
          <p className="text-secondary mt-1 mb-0" style={{ fontSize: '0.95rem' }}>
            AI-detected recurring themes and storylines organized topic-wise
            {selectedEntity ? ` for ${selectedEntity.name || selectedEntity.entityId}` : ''}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn btn-secondary flex items-center gap-2" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="card mb-4" role="alert" style={{ borderColor: 'var(--status-error)', color: 'var(--status-error)' }}>
          {error}
        </div>
      )}

      {/* Segmented Tab Control (Unified Navigation Control) */}
      <div className="mb-4">
        <div className="segmented-tabs-bar" role="tablist" aria-label="Narrative visibility filters">
          <button
            type="button"
            role="tab"
            aria-selected={activeVisibilityTab === 'established'}
            onClick={() => setActiveVisibilityTab('established')}
            className={`segmented-tab-btn ${activeVisibilityTab === 'established' ? 'active' : ''}`}
          >
            <ShieldCheck size={16} />
            <span>Established Narratives</span>
            <span 
              className="segmented-tab-badge"
              style={{
                background: activeVisibilityTab === 'established' ? 'rgba(37, 99, 235, 0.14)' : 'rgba(148, 163, 184, 0.18)',
                color: activeVisibilityTab === 'established' ? '#2563eb' : 'var(--text-secondary)'
              }}
            >
              {establishedCount}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeVisibilityTab === 'candidates'}
            onClick={() => setActiveVisibilityTab('candidates')}
            className={`segmented-tab-btn ${activeVisibilityTab === 'candidates' ? 'active' : ''}`}
          >
            <EyeOff size={16} />
            <span>Candidate Observations</span>
            <span 
              className="segmented-tab-badge"
              style={{
                background: activeVisibilityTab === 'candidates' ? 'rgba(217, 119, 6, 0.14)' : 'rgba(148, 163, 184, 0.18)',
                color: activeVisibilityTab === 'candidates' ? '#d97706' : 'var(--text-secondary)'
              }}
            >
              {candidateCount}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeVisibilityTab === 'all'}
            onClick={() => setActiveVisibilityTab('all')}
            className={`segmented-tab-btn ${activeVisibilityTab === 'all' ? 'active' : ''}`}
          >
            <span>All Records</span>
            <span 
              className="segmented-tab-badge"
              style={{
                background: activeVisibilityTab === 'all' ? 'rgba(100, 116, 139, 0.15)' : 'rgba(148, 163, 184, 0.18)',
                color: activeVisibilityTab === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)'
              }}
            >
              {items.length}
            </span>
          </button>
        </div>

        {/* Tab Purpose Explanation Banner */}
        <div 
          className="mt-2.5 p-2.5 px-3.5 rounded-lg border text-xs flex items-center gap-2" 
          style={{ 
            background: 'var(--surface-color-soft)', 
            borderColor: 'var(--border-color)', 
            color: 'var(--text-secondary)' 
          }}
        >
          <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
            {activeVisibilityTab === 'established' && 'Established Narratives:'}
            {activeVisibilityTab === 'candidates' && 'Candidate Observations:'}
            {activeVisibilityTab === 'all' && 'All Records:'}
          </span>
          <span>
            {activeVisibilityTab === 'established' && 'Observations that meet evidence-strength criteria (corroborated across independent sources or repeated claims) for executive display.'}
            {activeVisibilityTab === 'candidates' && 'Internally retained observations that have not yet met multi-evidence requirements for established narrative visibility.'}
            {activeVisibilityTab === 'all' && 'Complete narrative intelligence inventory including established storylines and uncorroborated candidate signals.'}
          </span>
        </div>
      </div>

      {/* Narrative Classification Filters */}
      <div 
        className="p-3.5 rounded-xl border mb-5 flex flex-wrap items-center justify-between gap-3 shadow-sm"
        style={{ background: 'var(--surface-color-soft)', borderColor: 'var(--border-color)' }}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Direction Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-secondary whitespace-nowrap">Direction:</span>
            <select
              value={directionFilter}
              onChange={(e) => {
                setDirectionFilter(e.target.value);
                if (e.target.value !== 'negative') setPriorityFilter('all');
                if (e.target.value !== 'positive') setSignificanceFilter('all');
              }}
              className="control-standard text-xs py-1 px-2.5 rounded-lg"
              style={{ minWidth: '130px' }}
            >
              <option value="all">All Directions ({directionCounts.all})</option>
              <option value="negative">Negative ({directionCounts.negative})</option>
              <option value="positive">Positive ({directionCounts.positive})</option>
              <option value="neutral">Neutral ({directionCounts.neutral})</option>
              <option value="mixed">Mixed ({directionCounts.mixed})</option>
            </select>
          </div>

          {/* Negative Priority Filter (visible when direction is 'all' or 'negative') */}
          {(directionFilter === 'all' || directionFilter === 'negative') && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-secondary whitespace-nowrap">Priority:</span>
              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  if (e.target.value !== 'all' && directionFilter !== 'negative') {
                    setDirectionFilter('negative');
                  }
                }}
                className="control-standard text-xs py-1 px-2.5 rounded-lg"
                style={{ minWidth: '140px' }}
              >
                <option value="all">All Priorities ({priorityCounts.all})</option>
                <option value="critical">Critical ({priorityCounts.critical})</option>
                <option value="high">High ({priorityCounts.high})</option>
                <option value="medium">Medium ({priorityCounts.medium})</option>
                <option value="low">Low ({priorityCounts.low})</option>
              </select>
            </div>
          )}

          {/* Positive Significance Filter (visible when direction is 'all' or 'positive') */}
          {(directionFilter === 'all' || directionFilter === 'positive') && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-secondary whitespace-nowrap">Significance:</span>
              <select
                value={significanceFilter}
                onChange={(e) => {
                  setSignificanceFilter(e.target.value);
                  if (e.target.value !== 'all' && directionFilter !== 'positive') {
                    setDirectionFilter('positive');
                  }
                }}
                className="control-standard text-xs py-1 px-2.5 rounded-lg"
                style={{ minWidth: '160px' }}
              >
                <option value="all">All Significance ({significanceCounts.all})</option>
                <option value="significant">Significant Highlight ({significanceCounts.significant})</option>
                <option value="notable">Notable Highlight ({significanceCounts.notable})</option>
                <option value="general">General Positive ({significanceCounts.general})</option>
              </select>
            </div>
          )}
        </div>

        {/* Clear Filters Button */}
        {isFilterActive && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="btn btn-secondary text-xs py-1 px-3 flex items-center gap-1.5 rounded-lg"
            title="Reset all filters to default"
          >
            <X size={13} /> Clear Filters
          </button>
        )}
      </div>

      {/* Search and Summary Bar */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div style={{ position: 'relative', width: '100%', maxWidth: '520px' }}>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '1rem',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <Search size={18} />
          </div>
          <input
            type="text"
            placeholder="Search topics, narratives, recommendations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-control"
            style={{
              paddingLeft: '2.75rem',
              paddingRight: '1rem',
              paddingTop: '0.65rem',
              paddingBottom: '0.65rem',
              width: '100%',
              fontSize: '0.95rem',
              backgroundColor: 'var(--surface-color)'
            }}
          />
        </div>

        <div className="flex items-center gap-2 text-secondary text-sm">
          <span>
            <strong>{filteredItems.length}</strong> {filteredItems.length === 1 ? 'narrative' : 'narratives'}
          </span>
          <span>·</span>
          <span>
            <strong>{topicNames.length}</strong> {topicNames.length === 1 ? 'topic' : 'topics'}
          </span>
        </div>
      </div>

      {/* Quick Topic Filter Chips (if multiple topics exist) */}
      {topicNames.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <button
            onClick={() => setActiveTopicFilter('All')}
            className={`btn text-xs py-1 px-3 ${activeTopicFilter === 'All' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '20px' }}
          >
            All Topics ({filteredItems.length})
          </button>
          {topicNames.map(topic => (
            <button
              key={topic}
              onClick={() => setActiveTopicFilter(topic)}
              className={`btn text-xs py-1 px-3 ${activeTopicFilter === topic ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: '20px' }}
            >
              {topic} ({groupedByTopic[topic]?.length || 0})
            </button>
          ))}
        </div>
      )}

      {/* Narratives Display */}
      {loading ? (
        <div className="card text-secondary py-12 text-center">Loading narratives…</div>
      ) : filteredItems.length === 0 ? (
        <div className="card text-secondary py-12 text-center">
          {searchQuery ? 'No narratives match your search query.' : 'No narratives found for this filter.'}
        </div>
      ) : (
        <div className="space-y-10">
          {displayedTopics.map(topicName => {
            const topicNarratives = groupedByTopic[topicName] || [];
            if (topicNarratives.length === 0) return null;

            return (
              <section key={topicName} aria-labelledby={`topic-heading-${topicName}`}>
                {/* Topic Section Header */}
                <div
                  className="flex items-center justify-between border-b pb-3 mb-5"
                  style={{ borderColor: 'var(--border-color, #e5e7eb)' }}
                >
                  <div className="flex items-center gap-2.5">
                    <Bookmark size={20} className="text-blue-500" />
                    <h2
                      id={`topic-heading-${topicName}`}
                      style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}
                    >
                      {topicName}
                    </h2>
                    <span
                      className="badge"
                      style={{
                        background: 'var(--surface-color-soft)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.8rem',
                        padding: '2px 8px',
                        borderRadius: '12px'
                      }}
                    >
                      {topicNarratives.length} {topicNarratives.length === 1 ? 'narrative' : 'narratives'}
                    </span>
                  </div>
                </div>

                {/* Narratives Grid for this Topic */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {topicNarratives.map(item => {
                    const meta = getClassificationMeta(item);
                    return (
                      <article
                        key={item._id}
                        tabIndex={0}
                        role="button"
                        aria-label={`View narrative: ${item.description}`}
                        onClick={() => setSelectedNarrative(item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedNarrative(item);
                          }
                        }}
                        className="card shadow-sm border flex flex-col justify-between cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        style={{
                          borderLeft: `4px solid ${meta.borderColor}`,
                          background: 'var(--surface-color)',
                          padding: '1.25rem 1.4rem',
                          userSelect: 'text'
                        }}
                      >
                        <div>
                          {/* Narrative Header Meta */}
                          <div className="flex items-center justify-between gap-2 mb-2.5 text-xs">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span 
                                className="badge text-xs px-2 py-0.5 rounded-md font-semibold"
                                style={{ background: 'var(--surface-color-soft)', color: 'var(--text-secondary)' }}
                              >
                                {normalizeTopic(item.topic, selectedEntity?.name)}
                              </span>

                              <span
                                className={`badge text-xs px-2 py-0.5 rounded-md font-semibold ${meta.badgeClass}`}
                              >
                                {meta.label}
                              </span>

                              {item.displayStatus === 'candidate' && (
                                <span
                                  className="badge text-xs px-2 py-0.5 rounded-md font-semibold"
                                  style={{
                                    background: 'rgba(245, 158, 11, 0.15)',
                                    color: '#b45309'
                                  }}
                                  title="Candidate observation awaiting corroborating sources"
                                >
                                  Candidate
                                </span>
                              )}
                            </div>

                            <span className="text-secondary whitespace-nowrap text-[11px]">
                              {item.lastObservedAt ? new Date(item.lastObservedAt).toLocaleDateString() : 'Date unavailable'}
                            </span>
                          </div>

                          {/* Clearly Identifiable Narrative Statement */}
                          <div className="mb-2.5">
                            <span 
                              className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded inline-block mb-1"
                              style={{
                                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                                color: 'var(--accent-blue, #2563eb)',
                                letterSpacing: '0.06em'
                              }}
                            >
                              Narrative Statement
                            </span>
                            <h3
                              className="text-base font-semibold leading-snug m-0"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              "{item.description}"
                            </h3>
                          </div>

                          {/* Actionable Recommendation Preview (Replaces Intelligence Summary) */}
                          {item.recommendation ? (
                            <div
                              className="rounded-lg p-2.5 mb-2 border text-xs"
                              style={{
                                background: 'rgba(16, 185, 129, 0.05)',
                                borderColor: 'rgba(16, 185, 129, 0.25)',
                                borderLeft: '3px solid #10b981'
                              }}
                            >
                              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold mb-1 text-[11px] uppercase tracking-wider">
                                <Lightbulb size={12} className="shrink-0" />
                                <span>Actionable Recommendation</span>
                              </div>
                              <p 
                                className="text-secondary text-xs m-0 italic leading-relaxed font-medium"
                                style={{
                                  display: '-webkit-box',
                                  WebkitLineClamp: 3,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden'
                                }}
                              >
                                "{item.recommendation}"
                              </p>
                            </div>
                          ) : (
                            <div 
                              className="rounded-lg p-2.5 mb-2 border text-xs text-muted italic"
                              style={{
                                background: 'var(--surface-color-soft)',
                                borderColor: 'var(--border-color)'
                              }}
                            >
                              No specific recommendation recorded for this observation.
                            </div>
                          )}
                        </div>

                        {/* Card Footer with Metrics & Click Prompt */}
                        <div
                          className="border-t pt-3 mt-3 flex items-center justify-between text-xs font-medium text-secondary"
                          style={{ borderColor: 'var(--border-color, #e5e7eb)' }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1" title="Claims Count">
                              <Layers size={13} /> {item.analysis?.claim_count || 0} claims
                            </span>
                            <span className="flex items-center gap-1" title="Sources Count">
                              <FileText size={13} /> {item.analysis?.source_count || 0} sources
                            </span>
                            <span className="flex items-center gap-1" title="Trend">
                              <TrendingUp size={13} /> {item.trend || item.analysis?.trend || 'Insufficient Data'}
                            </span>
                          </div>

                          <span
                            className="flex items-center gap-1 text-xs font-semibold"
                            style={{ color: meta.color }}
                          >
                            Details <ChevronRight size={14} />
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Fully Opaque Details Modal with Reliable Scrolling and Escape Key */}
      {selectedNarrative && (() => {
        const modalMeta = getClassificationMeta(selectedNarrative);
        return (
          <div
            role="dialog"
            aria-modal="true"
            className="modal-backdrop-solid"
            onClick={() => setSelectedNarrative(null)}
          >
            <div
              className="modal-dialog-solid"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 1 & 2. Modal Header - Topic, Severity, Status & Clearly Highlighted Narrative Statement */}
              <div className="modal-header-solid flex-col items-stretch gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span 
                      className="px-2.5 py-1 rounded-md text-xs font-semibold"
                      style={{ background: 'var(--surface-color-soft)', color: 'var(--text-secondary)' }}
                    >
                      {normalizeTopic(selectedNarrative.topic, selectedEntity?.name)}
                    </span>
                    <span
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold ${modalMeta.badgeClass}`}
                    >
                      {modalMeta.label}
                    </span>
                    {selectedNarrative.displayStatus === 'candidate' && (
                      <span
                        className="px-2.5 py-1 rounded-md text-xs font-semibold"
                        style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#b45309' }}
                      >
                        Candidate Observation
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:text-primary transition-colors cursor-pointer border-none bg-transparent hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
                    onClick={() => setSelectedNarrative(null)}
                    aria-label="Close details"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Visually Distinct Narrative Statement Container */}
                <div 
                  className="rounded-xl p-3.5 sm:p-4 border shadow-xs"
                  style={{
                    background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.07) 0%, rgba(99, 102, 241, 0.04) 100%)',
                    borderColor: 'rgba(59, 130, 246, 0.3)',
                    borderLeft: '4px solid var(--accent-blue, #2563eb)'
                  }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span 
                      className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded inline-block"
                      style={{
                        backgroundColor: 'rgba(37, 99, 235, 0.15)',
                        color: 'var(--accent-blue, #2563eb)',
                        letterSpacing: '0.08em'
                      }}
                    >
                      Narrative Statement
                    </span>
                  </div>
                  <p 
                    className="text-base sm:text-lg font-bold leading-snug sm:leading-relaxed m-0"
                    style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}
                  >
                    "{selectedNarrative.description}"
                  </p>
                </div>
              </div>

              {/* Modal Body - Scrollable Container */}
              <div className="modal-body-scrollable">
                {/* Classification Rationale Callout if available */}
                {selectedNarrative.classificationReason && (
                  <div 
                    className="p-3.5 rounded-xl border text-xs" 
                    style={{ 
                      background: 'var(--surface-color-soft)', 
                      borderColor: 'var(--border-color)', 
                      color: 'var(--text-secondary)' 
                    }}
                  >
                    <div className="flex items-center gap-1.5 font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                      <span>Classification Context & Impact</span>
                    </div>
                    <p className="m-0 leading-relaxed">{selectedNarrative.classificationReason}</p>
                    {selectedNarrative.impactIndicators && selectedNarrative.impactIndicators.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {selectedNarrative.impactIndicators.map((ind, idx) => (
                          <span 
                            key={idx} 
                            className="px-2 py-0.5 rounded-full text-xs font-mono font-medium"
                            style={{ 
                              background: 'var(--surface-color-strong)', 
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-secondary)'
                            }}
                          >
                            #{ind}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              {/* 3. Horizontal 4-Metric Grid (1 row on md+, 2x2 on small screens) */}
              <div
                className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl border shadow-sm"
                style={{ 
                  background: 'var(--surface-color-soft)', 
                  borderColor: 'var(--border-color)' 
                }}
              >
                <div className="flex flex-col justify-center">
                  <span className="text-secondary text-xs uppercase tracking-wider font-semibold block mb-1">Claim Count</span>
                  <strong className="text-xl font-extrabold" style={{ color: 'var(--text-primary)' }}>
                    {selectedNarrative.analysis?.claim_count || 0}
                  </strong>
                </div>
                <div className="flex flex-col justify-center">
                  <span className="text-secondary text-xs uppercase tracking-wider font-semibold block mb-1">Source Count</span>
                  <strong className="text-xl font-extrabold" style={{ color: 'var(--text-primary)' }}>
                    {selectedNarrative.analysis?.source_count || (selectedNarrative.supportingEvidence?.sources?.length || 0)}
                  </strong>
                </div>
                <div className="flex flex-col justify-center">
                  <span className="text-secondary text-xs uppercase tracking-wider font-semibold block mb-1">Trend</span>
                  <div>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full font-semibold text-xs ${
                      (selectedNarrative.trend || selectedNarrative.analysis?.trend) === 'Rising' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' :
                      (selectedNarrative.trend || selectedNarrative.analysis?.trend) === 'Declining' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' :
                      (selectedNarrative.trend || selectedNarrative.analysis?.trend) === 'Stable' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}>
                      {selectedNarrative.trend || selectedNarrative.analysis?.trend || 'Insufficient Data'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col justify-center">
                  <span className="text-secondary text-xs uppercase tracking-wider font-semibold block mb-1">Last Observed</span>
                  <strong className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {selectedNarrative.lastObservedAt ? new Date(selectedNarrative.lastObservedAt).toLocaleDateString() : 'N/A'}
                  </strong>
                </div>
              </div>

              {/* 4. Evidence Velocity & Temporal Activity Graph */}
              <div 
                className="rounded-xl border overflow-hidden p-1"
                style={{ 
                  background: 'var(--surface-color-strong)', 
                  borderColor: 'var(--border-color)' 
                }}
              >
                <TrendGraph
                  timeline={selectedNarrative.timeline || selectedNarrative.analysis?.temporal_information?.timeline || []}
                  trend={selectedNarrative.trend || selectedNarrative.analysis?.trend || 'Insufficient Data'}
                  title="Evidence Velocity & Temporal Activity"
                />
              </div>

              {/* 5. Actionable Recommendation (Prominently Placed Above Intelligence Brief) */}
              {selectedNarrative.recommendation && (
                <div
                  className="p-4 sm:p-4.5 rounded-xl border shadow-xs"
                  style={{
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.03) 100%)',
                    borderColor: 'rgba(16, 185, 129, 0.35)',
                    borderLeft: '4px solid #10b981'
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div 
                      style={{ 
                        width: '26px', 
                        height: '26px', 
                        borderRadius: '6px', 
                        backgroundColor: 'rgba(16, 185, 129, 0.18)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        color: '#059669' 
                      }}
                    >
                      <Lightbulb size={15} />
                    </div>
                    <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-400 m-0">
                      Actionable Recommendation
                    </h4>
                  </div>
                  <p 
                    className="italic leading-relaxed m-0 font-medium"
                    style={{ 
                      fontSize: '0.9375rem', 
                      lineHeight: '1.6', 
                      color: 'var(--text-primary)' 
                    }}
                  >
                    "{selectedNarrative.recommendation}"
                  </p>
                </div>
              )}

              {/* 6. Executive Intelligence Brief */}
              <div 
                className="p-4 rounded-xl border border-l-4"
                style={{ 
                  background: 'var(--surface-color-soft)',
                  borderColor: 'var(--border-color)',
                  borderLeftColor: 'var(--accent-blue)'
                }}
              >
                <h4 className="font-bold text-sm mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  Executive Intelligence Brief
                </h4>
                <p className="text-secondary leading-relaxed whitespace-pre-wrap m-0 text-sm">
                  {selectedNarrative.intelligence || 'No detailed intelligence summary available for this narrative.'}
                </p>
              </div>

              {/* Candidate Status Note (if applicable) */}
              {selectedNarrative.displayStatus === 'candidate' && selectedNarrative.eligibilityReason && (
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300">
                  <strong className="font-semibold">Candidate Status Note:</strong> {selectedNarrative.eligibilityReason}. This observation is retained internally and will transition to an established narrative once additional independent evidence is processed.
                </div>
              )}

              {/* 7. Supporting Sources */}
              {selectedNarrative.supportingEvidence?.sources?.length > 0 && (
                <div className="pt-1">
                  <h4 className="font-bold text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                    Supporting Sources ({selectedNarrative.supportingEvidence.sources.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedNarrative.supportingEvidence.sources.map((src, i) => (
                      <span 
                        key={i} 
                        className="px-3 py-1 rounded-lg text-xs font-medium border"
                        style={{ 
                          background: 'var(--surface-color-soft)', 
                          borderColor: 'var(--border-color)',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {src}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 8. Supporting Claims/Evidence */}
              <div className="pt-1">
                <h4 className="font-bold text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                  Supporting Claims & Evidence
                </h4>
                <div 
                  className="p-4 rounded-xl border"
                  style={{ 
                    background: 'var(--surface-color-soft)', 
                    borderColor: 'var(--border-color)' 
                  }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2 text-xs">
                    <div>
                      <span className="text-secondary block">Total Supporting Claims:</span>
                      <strong className="text-sm font-bold text-primary">{selectedNarrative.analysis?.claim_count || 0} claims extracted</strong>
                    </div>
                    <div>
                      <span className="text-secondary block">Related Source Documents:</span>
                      <strong className="text-sm font-bold text-primary">{(selectedNarrative.supportingEvidence?.document_ids || []).length} documents indexed</strong>
                    </div>
                  </div>

                  {Array.isArray(selectedNarrative.supportingEvidence?.claims) && selectedNarrative.supportingEvidence.claims.length > 0 && (
                    <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: 'var(--border-color)' }}>
                      <span className="text-xs font-semibold text-secondary block">Sample Corroborating Claims:</span>
                      {selectedNarrative.supportingEvidence.claims.slice(0, 5).map((clm, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-white dark:bg-black/20 border text-xs text-primary" style={{ borderColor: 'var(--border-color)' }}>
                          "{typeof clm === 'string' ? clm : clm.claim || clm.text || JSON.stringify(clm)}"
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer - Fixed Bottom */}
            <div className="modal-footer-solid">
              <button 
                type="button"
                className="btn btn-secondary px-5" 
                onClick={() => setSelectedNarrative(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      );
    })()}
  </section>
);
}
