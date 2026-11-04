import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Network, Activity, FileText, Lightbulb } from 'lucide-react';
import TrendGraph from '../components/TrendGraph';

const NarrativeDetail = () => {
  const { id } = useParams();
  const [narrative, setNarrative] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchNarrative = async () => {
      try {
        const { data } = await axios.get(`/api/narratives/${id}`, { withCredentials: true });
        setNarrative(data);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch narrative');
        setLoading(false);
      }
    };
    fetchNarrative();
  }, [id]);

  if (loading) return <div className="p-4">Loading narrative...</div>;
  if (error) return <div className="p-4 text-error">{error}</div>;
  if (!narrative) return <div className="p-4">Narrative not found.</div>;

  const currentTrend = narrative.trend || narrative.analysis?.trend || 'Insufficient Data';
  const timelineData = narrative.timeline || narrative.analysis?.temporal_information?.timeline || [];

  return (
    <div className="w-full max-w-5xl mx-auto pb-12">
      <div className="flex flex-col mb-8">
        <div>
          <Link to="/narratives" className="btn btn-ghost flex items-center text-secondary hover:text-primary mb-6 p-0 shadow-none border-none bg-transparent" style={{ textDecoration: 'none', width: 'fit-content' }}>
            <ArrowLeft size={16} className="mr-1" /> Back to Narratives
          </Link>
        </div>
        {/* Topic & Meta */}
        <div className="flex items-center gap-3 mb-3">
          <span className="badge badge-outline border border-gray-300 px-3 py-1 text-sm rounded bg-gray-50">{narrative.topic || narrative.narrativeId}</span>
          <span className="text-secondary text-sm font-medium flex items-center gap-1">
            <Activity size={14} /> Trend: <strong>{currentTrend}</strong>
          </span>
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
            "{narrative.description}"
          </p>
        </div>

        {/* 4-Metric Horizontal Row (Responsive: 1 row on md+, 2x2 on small screens) */}
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-3.5 p-4 rounded-xl border mb-6 shadow-sm"
          style={{ background: 'var(--surface-color-soft)', borderColor: 'var(--border-color)' }}
        >
          <div className="flex flex-col justify-center">
            <span className="text-secondary text-xs uppercase tracking-wider font-semibold block mb-0.5">Claim Count</span>
            <strong className="text-xl" style={{ color: 'var(--text-primary)' }}>{narrative.analysis?.claim_count || 0}</strong>
          </div>
          <div className="flex flex-col justify-center">
            <span className="text-secondary text-xs uppercase tracking-wider font-semibold block mb-0.5">Source Count</span>
            <strong className="text-xl" style={{ color: 'var(--text-primary)' }}>
              {narrative.analysis?.source_count || (narrative.supportingEvidence?.sources?.length || 0)}
            </strong>
          </div>
          <div className="flex flex-col justify-center">
            <span className="text-secondary text-xs uppercase tracking-wider font-semibold block mb-0.5">Trend</span>
            <strong className="text-sm">
              <span className={`inline-block px-2.5 py-0.5 rounded-full font-semibold text-xs ${
                currentTrend === 'Rising' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' :
                currentTrend === 'Declining' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' :
                currentTrend === 'Stable' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300' :
                'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
              }`}>
                {currentTrend}
              </span>
            </strong>
          </div>
          <div className="flex flex-col justify-center">
            <span className="text-secondary text-xs uppercase tracking-wider font-semibold block mb-0.5">Last Observed</span>
            <strong className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {narrative.lastObservedAt ? new Date(narrative.lastObservedAt).toLocaleDateString() : 'N/A'}
            </strong>
          </div>
        </div>
      </div>

      {/* Trend & Evidence Graph */}
      <div className="mb-6">
        <TrendGraph
          timeline={timelineData}
          trend={currentTrend}
          title="Evidence Velocity & Temporal Activity"
        />
      </div>

      {/* 5. Actionable Recommendation (Prominently Placed Above Intelligence Brief) */}
      {narrative.recommendation && (
        <div
          className="card mb-6 p-5"
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
            "{narrative.recommendation}"
          </p>
        </div>
      )}

      {/* 6. Executive Intelligence Brief */}
      {narrative.intelligence && (
        <div className="card mb-6 p-5" style={{ borderColor: 'var(--primary-color)' }}>
          <h3 className="mb-2 font-semibold text-sm border-b pb-2 flex items-center gap-2" style={{ color: 'var(--primary-color)' }}>
            Executive Intelligence Brief
          </h3>
          <p className="leading-relaxed text-secondary whitespace-pre-wrap m-0 text-sm">{narrative.intelligence}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card flex flex-col justify-between">
          <div className="card-header flex items-center gap-2 mb-4 border-b pb-2">
            <Network size={18} className="text-primary-color" />
            <h3 className="m-0 text-lg">Cross-Source Presence</h3>
          </div>
          <div className="text-secondary p-4">
            <p><strong>Unique Sources:</strong> {narrative.analysis?.source_count || (narrative.supportingEvidence?.sources?.length || 0)}</p>
            <p className="mt-2"><strong>Sources:</strong></p>
            <div className="flex flex-wrap gap-2 mt-1">
              {(narrative.supportingEvidence?.sources || []).map((src, i) => (
                <span key={i} className="badge badge-outline">{src}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="card flex flex-col justify-between">
          <div className="card-header flex items-center gap-2 mb-4 border-b pb-2">
            <FileText size={18} className="text-primary-color" />
            <h3 className="m-0 text-lg">Supporting Evidence</h3>
          </div>
          <div className="text-secondary p-2 flex-1">
            <p className="mb-3"><strong className="text-primary">Total Supporting Claims:</strong> <span className="text-lg">{narrative.analysis?.claim_count || 0}</span></p>
            <p><strong className="text-primary">Related Documents:</strong> <span className="text-lg">{(narrative.supportingEvidence?.document_ids || []).length}</span></p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NarrativeDetail;
