import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Search, Filter, AlertCircle } from 'lucide-react';

const DataOverview = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get('/api/data', { withCredentials: true });
        // Handling the new paginated structure { documents, page, pages, total }
        setData(response.data.documents || response.data); 
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch intelligence data');
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="p-4">Loading intelligence stream...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1>Intelligence Data</h1>
          <p className="text-secondary mt-1">Overview of collected documents and raw intel.</p>
        </div>
        <div className="flex gap-2">
          <div className="form-control flex items-center gap-2" style={{ width: 'auto', padding: '0.5rem' }}>
            <Search size={16} className="text-muted" />
            <input type="text" placeholder="Search data..." style={{ background: 'transparent', border: 'none', color: 'inherit', outline: 'none' }} />
          </div>
          <button className="btn btn-secondary"><Filter size={16} className="mr-2" /> Filter</button>
        </div>
      </div>

      {error ? (
        <div className="empty-state border-error text-error">
          <AlertCircle size={48} />
          <h3 className="mt-3">{error}</h3>
        </div>
      ) : data.length === 0 ? (
        <div className="empty-state">
          <Database size={48} />
          <h3 className="mt-3">No intelligence data available yet.</h3>
          <p className="mt-2 text-muted">Data collection agents have not populated the database.</p>
        </div>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title / Preview</th>
                <th>Source</th>
                <th>Collected Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((doc) => (
                <tr key={doc._id}>
                  <td>
                    <Link to={`/news/${doc._id}`} className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {doc.title && doc.title !== 'Untitled' ? doc.title : doc.rawText?.substring(0, 50) + '...'}
                    </Link>
                  </td>
                  <td>
                    <span className="badge badge-outline">{doc.source}</span>
                  </td>
                  <td className="text-secondary">
                    {doc.collectedDate ? new Date(doc.collectedDate).toLocaleDateString() : 'Unknown'}
                  </td>
                  <td>
                    {doc.processingStatus === 'not_processed' ? (
                      <span className="badge badge-warning">Unprocessed</span>
                    ) : doc.processingStatus === 'completed' ? (
                      <span className="badge badge-success">Processed</span>
                    ) : (
                      <span className="badge badge-info">{doc.processingStatus}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DataOverview;
