import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Network, TrendingUp, AlertCircle, Bookmark, ArrowLeft, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEntity } from '../context/EntityContext';

const Narratives = () => {
  const { selectedEntity } = useEntity();
  const [narratives, setNarratives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Navigation State
  // view: 'TOPICS' | 'NARRATIVES' | 'DETAIL'
  const [view, setView] = useState('TOPICS');
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [selectedNarrative, setSelectedNarrative] = useState(null);

  useEffect(() => {
    const fetchNarratives = async () => {
      if (!selectedEntity) return;
      try {
        const { data } = await axios.get(`/api/narratives?entity_id=${selectedEntity.entityId}`, { withCredentials: true });
        setNarratives(data);
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
    // Hide low-evidence narratives from UI
    if (!n.analysis || !n.analysis.claim_count || n.analysis.claim_count <= 1) {
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

  // Group narratives by topic
  const groupedNarratives = filteredNarratives.reduce((acc, narrative) => {
    const topic = narrative.topic || 'General';
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
                      {nList.length} narratives
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
            {groupedNarratives[selectedTopic]?.map(n => (
              <div key={n._id} className="card shadow-sm border flex flex-col justify-between">
                <div>
                  <h3 className="text-primary font-semibold mb-3 leading-snug">{n.description}</h3>
                  {n.recommendation && (
                    <div className="text-sm text-secondary mb-4 italic border-l-2 pl-3 py-1" style={{ borderColor: 'var(--success-color, #22c55e)' }}>
                      "{n.recommendation.substring(0, 80)}..."
                    </div>
                  )}
                </div>
                
                <div className="border-t pt-4 mt-auto" style={{ borderColor: 'var(--border-color, #e2e8f0)' }}>
                  <div className="flex flex-wrap items-center justify-between mb-4">
                    <div className="flex gap-4 text-xs font-semibold text-secondary">
                      <span className="flex items-center gap-1">
                        <TrendingUp size={14} /> 
                        Trend: {n.trend || 'Stable'}
                      </span>
                      <span>Claims: {n.analysis?.claim_count || 0}</span>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => { setSelectedNarrative(n); setView('DETAIL'); }}
                    className="btn btn-secondary w-full"
                  >
                    View Details &rarr;
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'DETAIL' && selectedNarrative && (
        <div>
          <div className="flex flex-col mb-12">
            <div>
              <button 
                onClick={() => setView('NARRATIVES')}
                className="btn btn-ghost flex items-center text-secondary hover:text-primary mb-6 p-0 shadow-none border-none bg-transparent"
              >
                <ArrowLeft size={16} className="mr-1" /> Back to Narratives
              </button>
            </div>
            <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem', lineHeight: '1.2' }}>{selectedNarrative.description}</h1>
            <div>
              <span className="badge badge-outline border border-gray-300 px-3 py-1 text-sm rounded bg-gray-50">{selectedNarrative.topic}</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="card shadow-sm border border-gray-100">
                <h3 className="font-semibold mb-3 border-b pb-2">Intelligence Summary</h3>
                <p className="text-secondary leading-relaxed whitespace-pre-wrap">{selectedNarrative.intelligence || 'No detailed intelligence available.'}</p>
              </div>
              
              <div className="card shadow-sm border border-gray-100">
                <h3 className="font-semibold mb-3 border-b pb-2">Recommendation / Action</h3>
                <p className="text-secondary leading-relaxed whitespace-pre-wrap italic">{selectedNarrative.recommendation || 'No specific recommendations provided.'}</p>
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="card bg-gray-50 border shadow-sm">
                <h3 className="font-semibold mb-3">Metrics</h3>
                <ul className="space-y-3 text-sm">
                  <li className="flex justify-between border-b border-gray-200 pb-1">
                    <span className="text-secondary">Claim Count</span>
                    <span className="font-semibold">{selectedNarrative.analysis?.claim_count || 0}</span>
                  </li>
                  <li className="flex justify-between border-b border-gray-200 pb-1">
                    <span className="text-secondary">Source Count</span>
                    <span className="font-semibold">{selectedNarrative.analysis?.source_count || 0}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-secondary">Trend</span>
                    <span className="font-semibold">{selectedNarrative.trend || 'Stable'}</span>
                  </li>
                </ul>
              </div>
              
              <div className="card bg-gray-50 border shadow-sm">
                <h3 className="font-semibold mb-3">Sources</h3>
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

