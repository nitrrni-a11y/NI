import React, { useEffect, useState } from 'react';
import api, { toArray } from '../services/api';
import { Network, TrendingUp, AlertCircle, Bookmark, ArrowLeft, Search, Lightbulb } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEntity } from '../context/EntityContext';
import TrendGraph from '../components/TrendGraph';

const normalizeTopic = (topic, entityName = '') => {
  if (!topic || typeof topic !== 'string' || !topic.trim() || topic.trim().toLowerCase() === 'unknown') {
    return 'General';
  }
  let clean = topic.trim();
  clean = clean.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();

  if (entityName && entityName.toLowerCase() !== 'unknown') {
    const esc = entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clean = clean.replace(new RegExp(`^${esc}\\s*[-–—:|/]?\\s*`, 'i'), '');
    clean = clean.replace(new RegExp(`\\s*[-–—:|/]?\\s*${esc}$`, 'i'), '');
  }

  clean = clean.replace(/^[\s\-–—:|/,.#'"]+|[\s\-–—:|/,.#'"]+$/g, '').trim();
  return clean || 'General';
};

const Narratives = () => {
  const { selectedEntity } = useEntity();
  const [narratives, setNarratives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Navigation State: 'TOPICS' | 'NARRATIVES' | 'DETAIL'
  const [view, setView] = useState('TOPICS');
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [selectedNarrative, setSelectedNarrative] = useState(null);

  useEffect(() => {
    const fetchNarratives = async () => {
      if (!selectedEntity) return;
      try {
        const { data } = await api.get(`/narratives?entity_id=${selectedEntity.entityId}`);
        setNarratives(toArray(data, 'narratives'));
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };
    fetchNarratives();
  }, [selectedEntity]);

  if (loading) return <div className="p-4">Loading narratives...</div>;
  if (!selectedEntity) return <div className="p-4">Please select a workspace.</div>;

  const filteredNarratives = narratives.filter(n => {
    // Hide low-evidence candidate observations from user dashboard
    if (n.isEligibleForDisplay === false || n.displayStatus === 'candidate') {
      return false;
    }
    // Fallback safeguard for legacy records
    if (!n.analysis || !n.analysis.claim_count || (n.analysis.claim_count <= 1 && (n.analysis.source_count || 0) <= 1 && n.severityLevel === 'normal')) {
      return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (n.topic && n.topic.toLowerCase().includes(q)) ||
      (n.description && n.description.toLowerCase().includes(q)) ||
      (n.intelligence && n.intelligence.toLowerCase().includes(q)) ||
      (n.recommendation && n.recommendation.toLowerCase().includes(q)) ||
      (n.supportingEvidence?.sources && n.supportingEvidence.sources.some(s => s.toLowerCase().includes(q)))
    );
  });

  // Group narratives by canonical topic
  const groupedNarratives = filteredNarratives.reduce((acc, narrative) => {
    const topic = normalizeTopic(narrative.topic, selectedEntity?.name);
    if (!acc[topic]) acc[topic] = [];
    acc[topic].push(narrative);
    return acc;
  }, {});

  return (
    <div className="w-full">
      {view === 'TOPICS' && (
        <div>
          <div className="flex flex-col mb-12">
            <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Global Narratives</h1>
            <p className="text-secondary mb-6" style={{ fontSize: '1.1rem' }}>AI-detected recurring themes and storylines.</p>
            <div style={{ position: 'relative', width: '100%', maxWidth: '800px' }}>
              <div style={{ position: 'absolute', top: '50%', left: '1rem', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
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
                  paddingTop: '0.85rem', 
                  paddingBottom: '0.85rem', 
                  width: '100%',
                  fontSize: '1rem',
                  backgroundColor: 'var(--surface-color)'
                }}
              />
            </div>
          </div>
          
          {filteredNarratives.length === 0 ? (
            <div className="empty-state card py-12 shadow-sm border border-gray-100">
              <Network size={48} className="text-muted mx-auto" />
              <h3 className="mt-3 text-center">No narratives found.</h3>
              <p className="mt-2 text-muted text-center">Try adjusting your search query.</p>
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-semibold mb-4 text-secondary border-b pb-2">Topics</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Object.entries(groupedNarratives).map(([topic, nList]) => (
                  <div 
                    key={topic} 
                    className="card shadow-sm border hover:border-primary transition-colors cursor-pointer"
                    onClick={() => { setSelectedTopic(topic); setView('NARRATIVES'); }}
                  >
                    <div className="flex items-center gap-2 mb-2 text-primary font-bold">
                      <Bookmark size={20} className="text-blue-500" /> <span className="truncate">{topic}</span>
                    </div>
                    <div className="text-sm text-secondary font-medium">
                      {nList.length} {nList.length === 1 ? 'narrative' : 'narratives'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'NARRATIVES' && (
        <div>
          <div className="flex flex-col mb-12">
            <div>
              <button 
                onClick={() => setView('TOPICS')}
                className="btn btn-ghost flex items-center text-secondary hover:text-primary mb-6 p-0 shadow-none border-none bg-transparent"
              >
                <ArrowLeft size={16} className="mr-1" /> Back to Topics
              </button>
            </div>
            <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }} className="flex items-center gap-2"><Bookmark size={28} className="text-blue-500" /> {selectedTopic}</h1>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {groupedNarratives[selectedTopic]?.map(n => {
              const isNeg = n.direction === 'negative';
              const isPos = n.direction === 'positive';
              const borderColor = isNeg 
                ? (n.priority === 'critical' || n.severityLevel === 'critical' ? '#dc2626' : n.priority === 'high' ? '#ea580c' : '#d97706')
                : (isPos ? '#10b981' : 'var(--border-color, #e2e8f0)');
              return (
                <div 
                  key={n._id} 
                  tabIndex={0}
                  role="button"
                  aria-label={`View narrative: ${n.description}`}
                  onClick={() => { setSelectedNarrative(n); setView('DETAIL'); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedNarrative(n);
                      setView('DETAIL');
                    }
                  }}
                  className="card shadow-sm border flex flex-col justify-between cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderLeft: `4px solid ${borderColor}`, userSelect: 'text' }}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2 text-xs">
                      {isNeg ? (
                        <span className={`badge text-xs px-2 py-0.5 rounded-md font-semibold ${
                          n.priority === 'critical' ? 'bg-red-100 text-red-800' : n.priority === 'high' ? 'bg-orange-100 text-orange-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {n.priority === 'critical' ? 'Critical' : n.priority === 'high' ? 'High Priority' : 'Medium Priority'}
                        </span>
                      ) : isPos ? (
                        <span className="badge text-xs px-2 py-0.5 rounded-md font-semibold bg-emerald-100 text-emerald-800">
                          {n.positiveSignificance === 'significant' ? 'Significant Highlight' : 'Positive Highlight'}
                        </span>
                      ) : (
                        <span className="badge text-xs px-2 py-0.5 rounded-md font-semibold bg-gray-100 text-gray-700">
                          Neutral
                        </span>
                      )}
                      <span className="text-secondary text-xs">
                        {n.lastObservedAt ? new Date(n.lastObservedAt).toLocaleDateString() : ''}
                      </span>
                    </div>

                    <div className="mb-2.5">
                      <span 
                        className="text-[9px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 rounded inline-block mb-1"
                        style={{
                          backgroundColor: 'rgba(37, 99, 235, 0.1)',
                          color: 'var(--accent-blue, #2563eb)',
                          letterSpacing: '0.06em'
                        }}
                      >
                        Narrative Statement
                      </span>
                      <h3 className="text-primary font-semibold text-base leading-snug m-0">"{n.description}"</h3>
                    </div>

                    {n.recommendation ? (
                      <div 
                        className="rounded-lg p-2.5 mb-3 border text-xs"
                        style={{
                          background: 'rgba(16, 185, 129, 0.05)',
                          borderColor: 'rgba(16, 185, 129, 0.25)',
                          borderLeft: '3px solid #10b981'
                        }}
                      >
                        <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold mb-1 text-[10px] uppercase tracking-wider">
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
                          "{n.recommendation}"
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg p-2 mb-3 border text-xs text-muted italic" style={{ background: 'var(--surface-color-soft)', borderColor: 'var(--border-color)' }}>
                        No specific recommendation recorded.
                      </div>
                    )}
                  </div>
                  
                  <div className="border-t pt-3 mt-auto flex items-center justify-between text-xs text-secondary font-medium" style={{ borderColor: 'var(--border-color, #e2e8f0)' }}>
                    <div className="flex gap-4">
                      <span className="flex items-center gap-1">
                        <TrendingUp size={14} /> 
                        {n.trend || n.analysis?.trend || 'Insufficient Data'}
                      </span>
                      <span>Claims: {n.analysis?.claim_count || 0}</span>
                    </div>
                    <span className="text-primary flex items-center gap-1 font-semibold">
                      Details &rarr;
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'DETAIL' && selectedNarrative && (
        <div>
          <div className="flex flex-col mb-8">
            <div>
              <button 
                onClick={() => setView('NARRATIVES')}
                className="btn btn-ghost flex items-center text-secondary hover:text-primary mb-6 p-0 shadow-none border-none bg-transparent"
              >
                <ArrowLeft size={16} className="mr-1" /> Back to Narratives
              </button>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <span className="badge badge-outline border border-gray-300 px-3 py-1 text-sm rounded bg-gray-50">{normalizeTopic(selectedNarrative.topic, selectedEntity?.name)}</span>
            </div>

            {/* Clearly Highlighted Narrative Statement */}
            <div 
              className="rounded-xl p-4 sm:p-5 border mb-6 shadow-xs"
              style={{
                background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.07) 0%, rgba(99, 102, 241, 0.04) 100%)',
                borderColor: 'rgba(59, 130, 246, 0.3)',
                borderLeft: '4px solid var(--accent-blue, #2563eb)'
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span 
                  className="text-[11px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded inline-block"
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
                className="text-lg sm:text-xl font-bold leading-relaxed m-0"
                style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}
              >
                "{selectedNarrative.description}"
              </p>
            </div>

            {/* 4-Metric Horizontal Row (Responsive: 1 row on md+, 2x2 on small screens) */}
            <div
              className="grid grid-cols-2 md:grid-cols-4 gap-3.5 p-4 rounded-xl border mb-6 shadow-sm"
              style={{ background: 'var(--surface-color-soft)', borderColor: 'var(--border-color)' }}
            >
              <div className="flex flex-col justify-center">
                <span className="text-secondary text-xs uppercase tracking-wider font-semibold block mb-0.5">Claim Count</span>
                <strong className="text-xl" style={{ color: 'var(--text-primary)' }}>{selectedNarrative.analysis?.claim_count || 0}</strong>
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-secondary text-xs uppercase tracking-wider font-semibold block mb-0.5">Source Count</span>
                <strong className="text-xl" style={{ color: 'var(--text-primary)' }}>
                  {selectedNarrative.analysis?.source_count || (selectedNarrative.supportingEvidence?.sources?.length || 0)}
                </strong>
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-secondary text-xs uppercase tracking-wider font-semibold block mb-0.5">Trend</span>
                <strong className="text-sm">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full font-semibold text-xs ${
                    (selectedNarrative.trend || selectedNarrative.analysis?.trend) === 'Rising' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' :
                    (selectedNarrative.trend || selectedNarrative.analysis?.trend) === 'Declining' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' :
                    (selectedNarrative.trend || selectedNarrative.analysis?.trend) === 'Stable' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300' :
                    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }`}>
                    {selectedNarrative.trend || selectedNarrative.analysis?.trend || 'Insufficient Data'}
                  </span>
                </strong>
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-secondary text-xs uppercase tracking-wider font-semibold block mb-0.5">Last Observed</span>
                <strong className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {selectedNarrative.lastObservedAt ? new Date(selectedNarrative.lastObservedAt).toLocaleDateString() : 'N/A'}
                </strong>
              </div>
            </div>
          </div>

          {/* Trend Graph */}
          <div className="mb-6">
            <TrendGraph
              timeline={selectedNarrative.timeline || selectedNarrative.analysis?.temporal_information?.timeline || []}
              trend={selectedNarrative.trend || selectedNarrative.analysis?.trend || 'Insufficient Data'}
              title="Evidence Velocity & Temporal Activity"
            />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* 5. Actionable Recommendation (Prominently Placed Above Intelligence Summary) */}
              {selectedNarrative.recommendation && (
                <div
                  className="card shadow-sm border p-5"
                  style={{
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.03) 100%)',
                    borderColor: 'rgba(16, 185, 129, 0.35)',
                    borderLeft: '4px solid #10b981'
                  }}
                >
                  <div className="flex items-center gap-2 mb-2.5">
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
                    <h3 className="font-bold text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-400 m-0">
                      Actionable Recommendation
                    </h3>
                  </div>
                  <p 
                    className="italic leading-relaxed m-0 font-medium"
                    style={{ fontSize: '0.9375rem', lineHeight: '1.6', color: 'var(--text-primary)' }}
                  >
                    "{selectedNarrative.recommendation}"
                  </p>
                </div>
              )}

              {/* 6. Executive Intelligence Brief / Summary */}
              <div className="card shadow-sm border border-gray-100 p-5">
                <h3 className="font-semibold text-sm mb-2 border-b pb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  Executive Intelligence Brief
                </h3>
                <p className="text-secondary leading-relaxed whitespace-pre-wrap m-0 text-sm">
                  {selectedNarrative.intelligence || 'No detailed intelligence available.'}
                </p>
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="card bg-gray-50 border shadow-sm">
                <h3 className="font-semibold mb-3">Supporting Sources ({selectedNarrative.supportingEvidence?.sources?.length || 0})</h3>
                {selectedNarrative.supportingEvidence?.sources?.length > 0 ? (
                  <ul className="list-disc pl-5 text-sm text-secondary space-y-1">
                    {selectedNarrative.supportingEvidence.sources.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">No specific sources identified.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Narratives;
