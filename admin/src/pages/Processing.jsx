import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Cpu, Play, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

const Processing = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);

  const fetchStatus = async () => {
    try {
      const { data } = await axios.get('/api/processing/status', { withCredentials: true });
      setStats(data);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleStartBatch = async () => {
    setProcessing(true);
    setResultMessage(null);
    try {
      const { data } = await axios.post('/api/processing/run-batch', {}, { withCredentials: true });
      setResultMessage({ type: 'success', text: data.message });
      await fetchStatus();
    } catch (err) {
      setResultMessage({ 
        type: 'error', 
        text: err.response?.data?.message || 'Error executing processing batch.' 
      });
      await fetchStatus();
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <div className="p-4">Loading processing status...</div>;

  const hasUnprocessed = (stats?.breakdown?.not_processed || 0) + (stats?.breakdown?.pending || 0) + (stats?.breakdown?.failed || 0) > 0;

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1>AI Processing Pipeline</h1>
          <p className="text-secondary mt-1">Manage the NLP and Narrative extraction queues.</p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={handleStartBatch}
          disabled={processing || !hasUnprocessed}
          style={{ opacity: processing || !hasUnprocessed ? 0.6 : 1, cursor: processing || !hasUnprocessed ? 'not-allowed' : 'pointer' }}
        >
          <Play size={16} className="mr-2" /> 
          {processing ? 'Processing Batch...' : 'Start Processing Batch'}
        </button>
      </div>

      {resultMessage && (
        <div className={`p-4 mb-6 rounded ${resultMessage.type === 'success' ? 'bg-success text-white' : 'bg-error text-white'}`}>
          {resultMessage.text}
        </div>
      )}

      <div className={`card mb-6 ${stats?.aiIntegrationEnabled ? 'border-success' : 'border-warning'}`}>
        <div className="flex gap-3">
          {stats?.aiIntegrationEnabled ? (
            <CheckCircle size={24} className="text-success flex-shrink-0" />
          ) : (
            <AlertTriangle size={24} className="text-warning flex-shrink-0" />
          )}
          <div>
            <h3 className={stats?.aiIntegrationEnabled ? 'text-success' : 'text-warning'}>
              {stats?.aiIntegrationEnabled ? 'AI Pipeline Active & Ready' : 'AI Integration Pending'}
            </h3>
            <p className="text-secondary mt-1 leading-relaxed">
              {stats?.message || "AI processing pipeline is connected."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card text-center">
          <h3 className="text-secondary mb-2">Total Records</h3>
          <h2 className="text-primary text-2xl">{stats?.total || 0}</h2>
        </div>
        
        <div className="card text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Clock size={16} className="text-warning" />
            <h3 className="text-secondary">Unprocessed</h3>
          </div>
          <h2 className="text-warning text-2xl">{stats?.breakdown?.not_processed || 0}</h2>
        </div>
        
        <div className="card text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Cpu size={16} className="text-info" />
            <h3 className="text-secondary">Processing</h3>
          </div>
          <h2 className="text-info text-2xl">{(stats?.breakdown?.pending || 0) + (stats?.breakdown?.processing || 0)}</h2>
        </div>

        <div className="card text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <CheckCircle size={16} className="text-success" />
            <h3 className="text-secondary">Completed</h3>
          </div>
          <h2 className="text-success text-2xl">{stats?.breakdown?.completed || 0}</h2>
        </div>
      </div>

      <div className="card">
        <h3>Pipeline Stages (Future)</h3>
        <p className="text-secondary mt-2 mb-4">When activated, documents will pass through the following autonomous stages:</p>
        
        <div className="space-y-3">
          {['1. Data Cleaning & Normalization', '2. Language Detection & Translation', '3. Topic & Entity Extraction', '4. Atomic Claim Extraction', '5. Sentiment & Stance Analysis', '6. Cross-Source Correlation', '7. Narrative Synthesis & Scoring'].map((stage, idx) => (
            <div key={idx} className="flex items-center p-3 rounded bg-surface-light border" style={{ borderColor: 'var(--border-color-light)' }}>
              <span className="text-secondary">{stage}</span>
              <span className="ml-auto text-xs badge badge-outline">Ready</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Processing;
