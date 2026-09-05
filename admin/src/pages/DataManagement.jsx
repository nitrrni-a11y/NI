import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Search, PlusCircle, Filter, Database } from 'lucide-react';
import { Link } from 'react-router-dom';

const DataManagement = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const fetchData = async (searchQuery = '') => {
    setLoading(true);
    try {
      const endpoint = searchQuery 
        ? `/api/news?keyword=${encodeURIComponent(searchQuery)}` 
        : `/api/news`;
      const response = await axios.get(endpoint, { withCredentials: true });
      const resData = response.data.documents || response.data;
      setData(Array.isArray(resData) ? resData : []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchData(query);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1>Data Management</h1>
          <p className="text-secondary mt-1">Manage raw intelligence documents.</p>
        </div>
        <Link to="/data/add" className="btn btn-primary flex items-center gap-2">
          <PlusCircle size={16} /> Add Document
        </Link>
      </div>

      <div className="flex gap-2 mb-4">
        <form onSubmit={handleSearch} className="form-control flex items-center gap-2" style={{ flex: 1, padding: '0.5rem' }}>
          <Search size={16} className="text-muted" />
          <input 
            type="text" 
            placeholder="Search raw text, titles..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', outline: 'none', width: '100%' }} 
          />
        </form>
        <button className="btn btn-secondary" onClick={() => fetchData(query)}>Search</button>
      </div>

      {loading ? (
        <div className="p-4">Loading database records...</div>
      ) : data.length === 0 ? (
        <div className="empty-state">
          <Database size={48} />
          <h3 className="mt-3">No documents found.</h3>
        </div>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title / Preview</th>
                <th>Source</th>
                <th>Type</th>
                <th>Date</th>
                <th>Processing</th>
              </tr>
            </thead>
            <tbody>
              {data.map((doc) => (
                <tr key={doc._id}>
                  <td className="font-semibold text-primary max-w-xs truncate">
                    {doc.title && doc.title !== 'Untitled' ? doc.title : doc.rawText?.substring(0, 40) + '...'}
                  </td>
                  <td>{doc.source}</td>
                  <td><span className="badge badge-outline">{doc.sourceType || 'Unknown'}</span></td>
                  <td className="text-secondary">{new Date(doc.collectedDate).toLocaleDateString()}</td>
                  <td>
                    {doc.processingStatus === 'not_processed' ? (
                      <span className="badge badge-warning">Unprocessed</span>
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

export default DataManagement;
