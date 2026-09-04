import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { ArrowLeft, ExternalLink, Calendar, User } from 'lucide-react';

const NewsDetails = () => {
  const { id } = useParams();
  const [news, setNews] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchNewsDetails = async () => {
      try {
        const { data } = await api.get(`/news/${id}`);
        setNews(data);
      } catch (err) {
        setError('Failed to fetch details');
      } finally {
        setLoading(false);
      }
    };
    fetchNewsDetails();
  }, [id]);

  if (loading) return <div className="container mt-8">Loading...</div>;
  if (error) return <div className="container mt-8"><div className="alert alert-error">{error}</div></div>;
  if (!news) return <div className="container mt-8">Data not found</div>;

  const publishedDate = new Date(news.publishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="container" style={{ paddingTop: '3rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '750px', margin: '0 auto' }}>
        
        <Link to="/news" className="btn btn-ghost mb-8 text-sm" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <ArrowLeft size={16} /> Back to data
        </Link>

        <div className="mb-4 flex items-center gap-2 text-xs font-semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <span className="text-accent">{news.category}</span>
          <span className="text-muted">•</span>
          <span className="text-secondary">{news.source}</span>
        </div>

        <h1 style={{ fontSize: '2.5rem', lineHeight: 1.2, marginBottom: '2rem', letterSpacing: '-0.02em' }}>
          {news.title}
        </h1>
        
        <div className="flex gap-6 text-light text-sm mb-8" style={{ paddingBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            <User size={16} className="text-muted" /> {news.author}
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-muted" /> {publishedDate}
          </div>
        </div>

        <div style={{ fontSize: '1.125rem', lineHeight: '1.8', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', marginBottom: '4rem' }}>
          {news.content}
        </div>

        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '2rem' }}>
          <a href={news.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary inline-flex items-center gap-2">
            View Original Source <ExternalLink size={16} />
          </a>
        </div>
        
      </div>
    </div>
  );
};

export default NewsDetails;
