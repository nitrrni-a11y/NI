import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Network, Activity, FileText, PieChart } from 'lucide-react';

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

  return (
    <div>
      <div className="flex flex-col mb-12">
        <div>
          <Link to="/narratives" className="btn btn-ghost flex items-center text-secondary hover:text-primary mb-6 p-0 shadow-none border-none bg-transparent" style={{ textDecoration: 'none', width: 'fit-content' }}>
            <ArrowLeft size={16} className="mr-1" /> Back to Narratives
          </Link>
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem', lineHeight: '1.2' }}>{narrative.description}</h1>
        <div className="flex items-center gap-3">
          <span className="badge badge-outline border border-gray-300 px-3 py-1 text-sm rounded bg-gray-50">{narrative.topic || narrative.narrativeId}</span>
          <span className="text-secondary text-sm font-medium flex items-center gap-1"><Activity size={14} /> Trend: {narrative.trend}</span>
        </div>
      </div>

      {narrative.intelligence && (
        <div className="card mb-4" style={{ borderColor: 'var(--primary-color)' }}>
          <h3 className="mb-2" style={{ color: 'var(--primary-color)' }}>Executive Intelligence Brief</h3>
          <p className="leading-relaxed text-secondary">{narrative.intelligence}</p>
        </div>
      )}

      {narrative.recommendation && (
        <div className="card mb-4" style={{ borderColor: 'var(--success-color)' }}>
          <h3 className="mb-2" style={{ color: 'var(--success-color)' }}>Strategic Recommendation</h3>
          <p className="leading-relaxed text-secondary">{narrative.recommendation}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        <div className="card flex flex-col justify-between">
          <div className="card-header flex items-center gap-2 mb-4 border-b pb-2">
            <Network size={18} className="text-primary-color" />
            <h3 className="m-0 text-lg">Cross-Source Presence</h3>
          </div>
          <div className="text-secondary p-4">
            <p><strong>Unique Sources:</strong> {narrative.analysis?.source_count || 0}</p>
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
