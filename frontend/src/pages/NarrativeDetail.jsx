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
      <Link to="/narratives" className="text-secondary flex items-center gap-2 mb-4">
        <ArrowLeft size={16} /> Back to Narratives
      </Link>

      <div className="mb-6">
        <h1 className="mb-2">{narrative.description}</h1>
        <div className="flex items-center gap-3 text-secondary">
          <span className="badge badge-outline">ID: {narrative.narrativeId}</span>
          <span>Score: {narrative.score}</span>
          <span>Trend: {narrative.trend}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <div className="card-header flex items-center gap-2">
            <PieChart size={18} />
            <h3>Stance & Sentiment</h3>
          </div>
          <div className="text-secondary text-center p-4 border border-dashed border-gray-700 rounded">
            Analysis processing pending...
          </div>
        </div>

        <div className="card">
          <div className="card-header flex items-center gap-2">
            <Activity size={18} />
            <h3>Cross-Source Presence</h3>
          </div>
          <div className="text-secondary text-center p-4 border border-dashed border-gray-700 rounded">
            Cross-source correlation pending...
          </div>
        </div>

        <div className="card col-span-2">
          <div className="card-header flex items-center gap-2">
            <FileText size={18} />
            <h3>Supporting Evidence (Claims)</h3>
          </div>
          <div className="text-secondary text-center p-4 border border-dashed border-gray-700 rounded">
            Claims database linkage pending...
          </div>
        </div>
      </div>
    </div>
  );
};

export default NarrativeDetail;
