import { useState, useEffect } from 'react';
import api from '../services/api';
import { ArrowRight, Search, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

const Dashboard = () => {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const { data } = await api.get('/news');
        setNews(data);
      } catch (err) {
        setError('Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };
    fetchNews();
  }, []);

  const filteredNews = news.filter(item => 
    item.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    item.source.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="container mt-4">Loading...</div>;
  if (error) return <div className="container mt-4"><div className="alert alert-error">{error}</div></div>;

  return (
    <div className="container" style={{ paddingTop: '3rem', paddingBottom: '4rem' }}>
      <div className="mb-8 max-w-2xl">
        <h1 className="mb-2" style={{ fontSize: '2.5rem' }}>Explore Narratives</h1>
        <p className="text-light text-lg">Browse collected information related to NIT Raipur.</p>
      </div>

      {/* Search Bar */}
      <div className="mb-8 relative" style={{ maxWidth: '600px' }}>
        <div style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
          <Search size={18} />
        </div>
        <input 
          type="text" 
          className="form-input" 
          placeholder="Search articles, sources or topics..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ paddingLeft: '2.5rem', paddingTop: '0.875rem', paddingBottom: '0.875rem', fontSize: '1rem', borderRadius: 'var(--radius-lg)' }}
        />
      </div>

      {news.length === 0 ? (
        <div className="card text-center" style={{ padding: '4rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ backgroundColor: 'var(--surface)', padding: '1rem', borderRadius: '50%', marginBottom: '1.5rem', display: 'inline-block' }}>
            <FileText size={32} className="text-muted" />
          </div>
          <h3 className="mb-2">No records available yet</h3>
          <p className="text-light mb-0">New collected information will appear here when it becomes available.</p>
        </div>
      ) : filteredNews.length === 0 ? (
        <div className="text-center text-light mt-8">No results found for "{searchTerm}"</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredNews.map((item) => (
            <div key={item._id} className="card card-interactive flex-col justify-between" style={{ padding: '1.5rem', height: '100%', display: 'flex', gap: '1rem' }}>
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="badge badge-primary text-xs" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.category}</span>
                  <span className="text-muted text-xs">
                    {new Date(item.publishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                
                <h3 style={{ fontSize: '1.125rem', marginBottom: '0.75rem', lineHeight: '1.4' }}>{item.title}</h3>
                
                <p className="text-light text-sm" style={{ 
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 0
                }}>
                  {item.content}
                </p>
              </div>
              
              <div className="flex justify-between items-center mt-4 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <span className="text-xs text-secondary font-medium">{item.source}</span>
                <Link to={`/news/${item._id}`} className="text-accent flex items-center gap-1 text-sm font-medium hover:text-accent-hover transition-colors">
                  View <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
