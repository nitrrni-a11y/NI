import React, { useState } from 'react';
import axios from 'axios';
import { Search as SearchIcon, Database } from 'lucide-react';
import { Link } from 'react-router-dom';

const Search = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setLoading(true);
    setHasSearched(true);
    try {
      const { data } = await axios.get(`/api/news?keyword=${encodeURIComponent(query)}`, { withCredentials: true });
      setResults(data.documents || data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div>
      <div className="mb-6">
        <h1>Global Search</h1>
        <p className="text-secondary mt-1">Search through intelligence documents, sources, and narratives.</p>
      </div>

      <form onSubmit={handleSearch} className="mb-6 flex gap-2">
        <div className="form-control flex items-center gap-2" style={{ flex: 1 }}>
          <SearchIcon size={18} className="text-muted" />
          <input 
            type="text" 
            placeholder="Enter keywords..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', outline: 'none', width: '100%' }} 
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {hasSearched && !loading && results.length === 0 && (
        <div className="empty-state">
          <SearchIcon size={48} />
          <h3 className="mt-3">No results found for "{query}"</h3>
        </div>
      )}

      {results.length > 0 && (
        <div>
          <h3 className="mb-3 text-secondary">Found {results.length} intelligence records</h3>
          <div className="grid gap-3">
            {results.map((doc) => (
              <div key={doc._id} className="card">
                <Link to={`/news/${doc._id}`}>
                  <h3 style={{ color: 'var(--text-primary)' }}>
                    {doc.title && doc.title !== 'Untitled' ? doc.title : 'Raw Document'}
                  </h3>
                </Link>
                <p className="text-secondary text-sm mt-2 mb-2 line-clamp-2">
                  {doc.rawText?.substring(0, 150)}...
                </p>
                <div className="flex gap-2 mt-2 text-xs">
                  <span className="badge badge-outline">{doc.source}</span>
                  <span className="text-muted">{new Date(doc.collectedDate).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Search;
