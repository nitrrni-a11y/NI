import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Clock, Globe, FileText, CheckCircle, Network, Layers, AlertCircle } from 'lucide-react';

const DataDetail = () => {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const { data } = await axios.get(`/api/news/${id}`, { withCredentials: true });
        setDoc(data);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch document details');
        setLoading(false);
      }
    };
    fetchDoc();
  }, [id]);

  if (loading) return <div className="p-4">Loading intelligence record...</div>;
  if (error) return <div className="p-4 text-error">{error}</div>;
  if (!doc) return <div className="p-4">Document not found.</div>;

  const isProcessed = doc.processingStatus === 'completed';

  return (
    <div>
      <Link to="/news" className="text-secondary flex items-center gap-2 mb-4">
        <ArrowLeft size={16} /> Back to Intelligence Data
      </Link>

      <div className="flex justify-between items-start mb-4">
        <div>
          <h1>{doc.title && doc.title !== 'Untitled' ? doc.title : 'Raw Intelligence Report'}</h1>
          <div className="flex items-center gap-3 mt-2 text-secondary">
            <span className="badge badge-outline">{doc.source}</span>
            <span className="flex items-center gap-1"><Clock size={14} /> {doc.collectedDate ? new Date(doc.collectedDate).toLocaleString() : 'Date Unknown'}</span>
            <span className="flex items-center gap-1"><Globe size={14} /> {doc.originalLanguage?.toUpperCase() || 'EN'}</span>
            
            {isProcessed ? (
              <span className="badge badge-success flex items-center gap-1"><CheckCircle size={12} /> Processed</span>
            ) : (
              <span className="badge badge-warning flex items-center gap-1"><AlertCircle size={12} /> Unprocessed</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Left Column: Raw Data */}
        <div className="flex-2" style={{ flex: '2 1 0%' }}>
          <div className="card mb-4">
            <div className="card-header flex items-center gap-2">
              <FileText size={18} />
              <h3>Source Text</h3>
            </div>
            <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed p-2" style={{ backgroundColor: 'var(--bg-color)', borderRadius: '4px' }}>
              {doc.rawText || doc.content}
            </div>
          </div>
        </div>

        {/* Right Column: AI Analysis Shell */}
        <div className="flex-1" style={{ flex: '1 1 0%' }}>
          
          <div className="card mb-4">
            <div className="card-header flex items-center gap-2">
              <Layers size={18} />
              <h3>Extracted Claims</h3>
            </div>
            {isProcessed ? (
              <div className="empty-state p-3">Claims interface ready.</div>
            ) : (
              <div className="text-secondary text-center p-4 border border-dashed border-gray-700 rounded">
                This document has not been processed yet.
              </div>
            )}
          </div>

          <div className="card mb-4">
            <div className="card-header flex items-center gap-2">
              <Network size={18} />
              <h3>Identified Narratives</h3>
            </div>
            {isProcessed ? (
              <div className="empty-state p-3">Narratives interface ready.</div>
            ) : (
              <div className="text-secondary text-center p-4 border border-dashed border-gray-700 rounded">
                This document has not been processed yet.
              </div>
            )}
          </div>

          <div className="card mb-4">
            <div className="card-header flex items-center gap-2">
              <CheckCircle size={18} />
              <h3>Entities & Topics</h3>
            </div>
            {isProcessed ? (
              <div className="empty-state p-3">Topics interface ready.</div>
            ) : (
              <div className="text-secondary text-center p-4 border border-dashed border-gray-700 rounded">
                This document has not been processed yet.
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default DataDetail;
