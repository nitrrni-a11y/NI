import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const AddData = () => {
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    source: '',
    sourceUrl: '',
    author: '',
    publishedAt: '',
    category: 'News'
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await api.post('/news', formData);
      navigate('/news');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px' }}>
      <div className="mb-8">
        <h1 className="mb-2">Add Data</h1>
        <p className="text-light">Add a new source record to the intelligence dataset.</p>
      </div>
      
      <div className="card">
        {error && <div className="alert alert-error">{error}</div>}
        
        <form onSubmit={handleSubmit} className="grid md:grid-cols-2">
          
          {/* Section: Basic Info */}
          <div style={{ gridColumn: '1 / -1', marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>Basic Information</h3>
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Title</label>
            <input type="text" name="title" className="form-input" value={formData.title} onChange={handleChange} placeholder="Article or record title" required />
          </div>

          <div className="form-group">
            <label className="form-label">Source Name</label>
            <input type="text" name="source" className="form-input" value={formData.source} onChange={handleChange} placeholder="e.g. Times of India" required />
          </div>

          <div className="form-group">
            <label className="form-label">Category</label>
            <select name="category" className="form-input" value={formData.category} onChange={handleChange} required>
              <option value="News">News</option>
              <option value="Social Media">Social Media</option>
              <option value="Forum">Forum</option>
              <option value="Official Notice">Official Notice</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Author</label>
            <input type="text" name="author" className="form-input" value={formData.author} onChange={handleChange} placeholder="Optional" />
          </div>

          <div className="form-group">
            <label className="form-label">Published Date</label>
            <input type="date" name="publishedAt" className="form-input" value={formData.publishedAt} onChange={handleChange} required />
          </div>

          {/* Section: Source details */}
          <div style={{ gridColumn: '1 / -1', marginTop: '1rem', marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>Source Details</h3>
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Source URL</label>
            <input type="url" name="sourceUrl" className="form-input" value={formData.sourceUrl} onChange={handleChange} placeholder="https://" required />
          </div>

          {/* Section: Content */}
          <div style={{ gridColumn: '1 / -1', marginTop: '1rem', marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>Content</h3>
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <textarea name="content" className="form-input form-textarea" value={formData.content} onChange={handleChange} placeholder="Paste the full collected text here..." style={{ minHeight: '200px' }} required></textarea>
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/news')}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Add Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddData;
