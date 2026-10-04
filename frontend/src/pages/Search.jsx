import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search as SearchIcon, AlertCircle, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

const Search = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [allNarratives, setAllNarratives] = useState([]);

  useEffect(() => {
    // Fetch all narratives once
    const fetchNarratives = async () => {
      try {
        const { data } = await axios.get('/api/narratives', { withCredentials: true });
        setAllNarratives(data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchNarratives();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setLoading(true);
    setHasSearched(true);
    
    const searchLower = query.toLowerCase();
    const filtered = allNarratives.filter(n => {
      const topicMatch = n.topic ? n.topic.toLowerCase().includes(searchLower) : false;
      const descMatch = n.description ? n.description.toLowerCase().includes(searchLower) : false;
      return topicMatch || descMatch;
    });
    
    setResults(filtered);
    setLoading(false);
  };

  return (
    <div>
      <div className="mb-6">
        <h1>Global Search</h1>
        <p className="text-secondary mt-1">Search through intelligence narratives and topics.</p>
      </div>

      <form onSubmit={handleSearch} className="mb-6 flex gap-2">
        <div className="form-control flex items-center gap-2" style={{ flex: 1 }}>
          <SearchIcon size={18} className="text-muted" />
          <input 
            type="text" 
            placeholder="Search for 'hostel', 'academics'..." 
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
          <h3 className="mb-3 text-secondary">Found {results.length} narrative(s)</h3>
          <div className="grid gap-3">
            {results.map((n) => (
              <div key={n._id} className="card hover:border-accent-blue transition-colors">
                <div className="mb-1"><span className="badge badge-outline">{n.topic?.toUpperCase() || 'GENERAL'}</span></div>
                <Link to={`/narratives/${n._id}`}>
                  <h3 style={{ color: 'var(--text-primary)' }}>
                    {n.description}
                  </h3>
                </Link>
                <div className="flex gap-4 mt-3 text-xs text-secondary border-t pt-2" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span className="flex items-center gap-1"><AlertCircle size={14} /> Score: {n.score}</span>
                  <span className="flex items-center gap-1"><TrendingUp size={14} /> Trend: {n.trend}</span>
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
