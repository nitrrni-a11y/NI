import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Hash } from 'lucide-react';

const Sources = () => {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSources = async () => {
      try {
        const { data } = await axios.get('/api/sources', { withCredentials: true });
        setSources(data);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };
    fetchSources();
  }, []);

  if (loading) return <div className="p-4">Loading sources...</div>;

  return (
    <div>
      <div className="mb-4">
        <h1>Sources</h1>
        <p className="text-secondary mt-1">Information sources monitored by the intelligence platform.</p>
      </div>

      {sources.length === 0 ? (
        <div className="empty-state">
          <Hash size={48} />
          <h3 className="mt-3">No sources monitored yet.</h3>
        </div>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Source Name</th>
                <th>Type</th>
                <th>Records Collected</th>
                <th>Last Update</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((src, i) => (
                <tr key={i}>
                  <td className="font-semibold text-primary">{src.name}</td>
                  <td><span className="badge badge-outline">{src.type}</span></td>
                  <td>{src.count}</td>
                  <td className="text-secondary">{new Date(src.latestDate).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Sources;
