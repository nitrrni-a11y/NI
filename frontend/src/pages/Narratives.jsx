import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Network, Search, TrendingUp, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

const Narratives = () => {
  const [narratives, setNarratives] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNarratives = async () => {
      try {
        const { data } = await axios.get('/api/narratives', { withCredentials: true });
        setNarratives(data);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };
    fetchNarratives();
  }, []);

  if (loading) return <div className="p-4">Loading narratives...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1>Global Narratives</h1>
          <p className="text-secondary mt-1">AI-detected recurring themes and storylines.</p>
        </div>
      </div>

      {narratives.length === 0 ? (
        <div className="empty-state">
          <Network size={48} />
          <h3 className="mt-3">No narratives have been identified yet.</h3>
          <p className="mt-2 text-muted">AI processing integration will be enabled in the next phase.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {narratives.map(n => (
            <div key={n._id} className="card hover:border-accent-blue transition-colors">
              <Link to={`/narratives/${n._id}`}>
                <h3 style={{ color: 'var(--text-primary)' }}>{n.description}</h3>
              </Link>
              <div className="flex items-center gap-4 mt-3 text-secondary text-sm">
                <span className="flex items-center gap-1"><AlertCircle size={14} /> Score: {n.score}</span>
                <span className="flex items-center gap-1"><TrendingUp size={14} /> Trend: {n.trend}</span>
                <span>Supporting Claims: {n.claimIds?.length || 0}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Narratives;
