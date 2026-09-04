import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { FileText, Plus } from 'lucide-react';

const ViewData = () => {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="mb-2">Data Library</h1>
          <p className="text-light">Browse and manage all collected source material.</p>
        </div>
        <Link to="/news/add" className="btn btn-primary">
          <Plus size={16} /> Add Record
        </Link>
      </div>

      {news.length === 0 ? (
        <div className="card text-center" style={{ padding: '4rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ backgroundColor: 'var(--surface)', padding: '1rem', borderRadius: '50%', marginBottom: '1.5rem', display: 'inline-block' }}>
            <FileText size={32} className="text-muted" />
          </div>
          <h3 className="mb-2">No data yet</h3>
          <p className="text-light mb-6">Collected records will appear here.</p>
          <Link to="/news/add" className="btn btn-secondary">
            Add first record
          </Link>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%' }}>
            <thead style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
              <tr>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Title</th>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source</th>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</th>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Published</th>
              </tr>
            </thead>
            <tbody>
              {news.map((item) => (
                <tr key={item._id} style={{ cursor: 'pointer' }} onClick={() => window.location.href=`/news/${item._id}`}>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{item.title}</div>
                  </td>
                  <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)' }}>{item.source}</td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <span className="badge">{item.category}</span>
                  </td>
                  <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)' }}>
                    {new Date(item.publishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
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

export default ViewData;
