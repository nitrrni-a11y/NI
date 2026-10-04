import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const AddData = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    title: '',
    rawText: '',
    source: '',
    sourceType: 'News',
    url: '',
    author: '',
    publicationDate: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await axios.post('/api/documents', formData, { withCredentials: true });
      navigate('/data');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add document');
      setLoading(false);
    }
  };

  return (
    <div className="add-data-page">
      <div className="add-data-heading">
        <h1>Add Document</h1>
        <p className="text-secondary">Manually ingest raw data into the pipeline.</p>
      </div>

      <div className="card add-data-card">
        {error && <div className="p-3 mb-4 rounded border-error text-error bg-opacity-10">{error}</div>}
        
        <form onSubmit={handleSubmit} className="add-data-form">
          <div className="form-group add-data-field add-data-field-full">
            <label className="form-label">Source / Provider *</label>
            <input 
              type="text" 
              name="source" 
              className="form-control add-data-control" 
              value={formData.source} 
              onChange={handleChange} 
              placeholder="e.g., Reuters, Subreddit Name, YouTube Channel"
              required 
            />
          </div>

          <div className="add-data-grid">
            <div className="form-group add-data-field">
              <label className="form-label">Source Type</label>
              <select name="sourceType" className="form-control add-data-control" value={formData.sourceType} onChange={handleChange}>
                <option value="News">News Article</option>
                <option value="SocialMedia">Social Media Post</option>
                <option value="VideoTranscript">Video Transcript</option>
                <option value="Report">Intelligence Report</option>
                <option value="Other">Other</option>
              </select>
            </div>
            
            <div className="form-group add-data-field">
              <label className="form-label">Publication Date</label>
              <input 
                type="date" 
                name="publicationDate" 
                className="form-control add-data-control" 
                value={formData.publicationDate} 
                onChange={handleChange} 
              />
            </div>
          </div>

          <div className="form-group add-data-field">
            <label className="form-label">Title / Headline</label>
            <input 
              type="text" 
              name="title" 
              className="form-control add-data-control" 
              value={formData.title} 
              onChange={handleChange} 
              placeholder="Optional if social media"
            />
          </div>

          <div className="form-group add-data-field">
            <label className="form-label">Author</label>
            <input
              type="text"
              name="author"
              className="form-control add-data-control"
              value={formData.author}
              onChange={handleChange}
              placeholder="Author or publisher name"
            />
          </div>

          <div className="form-group add-data-field add-data-field-full">
            <label className="form-label">Original URL</label>
            <input 
              type="url" 
              name="url" 
              className="form-control add-data-control" 
              value={formData.url} 
              onChange={handleChange} 
            />
          </div>

          <div className="form-group add-data-field add-data-field-full">
            <label className="form-label">Raw Text *</label>
            <p className="text-muted text-xs mb-2">Provide the exact, unedited raw text. The AI pipeline will handle cleaning and normalization.</p>
            <textarea 
              name="rawText" 
              className="form-control add-data-control add-data-textarea" 
              value={formData.rawText} 
              onChange={handleChange} 
              required 
            />
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/data')}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Ingesting...' : 'Add to Database'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddData;
