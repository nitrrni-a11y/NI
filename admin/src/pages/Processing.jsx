import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Cpu, Play, CheckCircle, Clock, AlertTriangle, Square, XCircle } from 'lucide-react';

const Processing = () => {
  const [stats, setStats] = useState(null);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [processLimit, setProcessLimit] = useState(0);

  const fetchData = async () => {
    try {
      const [statsRes, jobRes] = await Promise.all([
        axios.get('/api/processing/status', { withCredentials: true }),
        axios.get('/api/processing/job-status', { withCredentials: true })
      ]);
      setStats(statsRes.data);
      const currentJob = jobRes.data;
      setJob(currentJob);
      
      if (currentJob && currentJob.status !== 'PROCESSING') {
        const remaining = currentJob.totalDocuments - currentJob.processedDocuments;
        setProcessLimit(remaining > 0 ? remaining : 0);
      }
      
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (job && job.status === 'PROCESSING') {
        fetchData();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [job?.status]);

  const handleStart = async () => {
    if (processLimit <= 0) {
      alert('Please specify a valid number of documents to process.');
      return;
    }
    setActionLoading(true);
    try {
      await axios.post('/api/processing/start', { 
        batchId: job?.batchId, 
        limit: processLimit 
      }, { withCredentials: true });
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Error starting processing.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    try {
      await axios.post('/api/processing/stop', {}, { withCredentials: true });
      await fetchData();
    } catch (err) {
      alert('Error stopping processing.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="p-4">Loading processing status...</div>;

  const isProcessing = job?.status === 'PROCESSING';
  const remainingInBatch = job ? (job.totalDocuments - job.processedDocuments) : 0;
  
  // Build form for limit
  const limitInput = (
    <div className="mb-4">
      <label className="block font-semibold mb-1 text-sm text-secondary">Documents to process:</label>
      <input 
        type="number" 
        min="1" 
        max={remainingInBatch} 
        value={processLimit} 
        onChange={(e) => {
          let val = parseInt(e.target.value);
          if (isNaN(val)) val = '';
          else if (val < 1) val = 1;
          else if (val > remainingInBatch) val = remainingInBatch;
          setProcessLimit(val);
        }}
        className="border rounded p-2 w-32 shadow-sm"
      />
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <h1>AI Processing Pipeline</h1>
        <p className="text-secondary mt-1">Manage the AI document processing and Narrative extraction queues.</p>
      </div>

      <div className={`card mb-6 ${stats?.aiIntegrationEnabled ? 'border-success' : 'border-warning'}`}>
        <div className="flex gap-3">
          {stats?.aiIntegrationEnabled ? (
            <CheckCircle size={24} className="text-success flex-shrink-0" />
          ) : (
            <AlertTriangle size={24} className="text-warning flex-shrink-0" />
          )}
          <div>
            <h3 className={stats?.aiIntegrationEnabled ? 'text-success' : 'text-warning'}>
              {stats?.aiIntegrationEnabled ? 'AI Pipeline Active & Ready' : 'AI Pipeline Status'}
            </h3>
            <p className="text-secondary mt-1 leading-relaxed">
              {stats?.message || "AI processing pipeline is connected."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card text-center">
          <h3 className="text-secondary mb-2">Total Database Records</h3>
          <h2 className="text-primary text-2xl">{stats?.total || 0}</h2>
        </div>
        <div className="card text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Clock size={16} className="text-warning" />
            <h3 className="text-secondary">Global Unprocessed</h3>
          </div>
          <h2 className="text-warning text-2xl">{(stats?.breakdown?.not_processed || 0) + (stats?.breakdown?.failed || 0)}</h2>
        </div>
        <div className="card text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Cpu size={16} className="text-info" />
            <h3 className="text-secondary">Global Processing</h3>
          </div>
          <h2 className="text-info text-2xl">{(stats?.breakdown?.pending || 0) + (stats?.breakdown?.processing || 0)}</h2>
        </div>
        <div className="card text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <CheckCircle size={16} className="text-success" />
            <h3 className="text-secondary">Global Completed</h3>
          </div>
          <h2 className="text-success text-2xl">{stats?.breakdown?.completed || 0}</h2>
        </div>
      </div>

      <div className="card mt-8 p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold mb-4 border-b pb-2">Current Processing Batch</h3>
        
        {(!job || job.status === 'IDLE') && (
          <div className="py-6">
            <p className="text-secondary mb-4">No processing batch available.</p>
            <p className="text-secondary mb-4">Upload a CSV file to create a new batch.</p>
          </div>
        )}

        {job && job.status !== 'IDLE' && (
          <div className="mb-6 grid grid-cols-2 gap-4 text-sm text-secondary bg-gray-50 p-4 rounded border">
            <div><strong>Batch:</strong> {job.batchId || 'Legacy'}</div>
            <div><strong>Created:</strong> {job.createdAt ? new Date(job.createdAt).toLocaleString() : 'N/A'}</div>
            <div><strong>Total Documents:</strong> {job.totalDocuments}</div>
            <div><strong>Processed:</strong> {job.processedDocuments} / {job.totalDocuments}</div>
            <div><strong>Unprocessed:</strong> {remainingInBatch}</div>
            <div><strong>Status:</strong> {job.status}</div>
          </div>
        )}

        {job?.status === 'READY' && remainingInBatch > 0 && (
          <div>
            <h3 className="text-primary font-semibold mb-2">Ready to process</h3>
            {limitInput}
            <button 
              className="btn btn-primary flex items-center" 
              onClick={handleStart}
              disabled={actionLoading}
              style={{ opacity: actionLoading ? 0.6 : 1 }}
            >
              <Play size={16} className="mr-2" /> 
              {actionLoading ? 'Starting...' : 'Start Processing'}
            </button>
          </div>
        )}

        {isProcessing && (
          <div>
            <p className="font-semibold text-primary mb-2">Processing Documents...</p>
            <p className="text-secondary mb-4">{job.processedDocuments} / {job.requestedDocuments} requested processed</p>
            
            <div className="w-full bg-gray-200 rounded-full h-4 mb-4" style={{ backgroundColor: '#e2e8f0', overflow: 'hidden' }}>
              <div 
                className="bg-primary h-4 rounded-full transition-all duration-500 ease-in-out" 
                style={{ width: `${job.requestedDocuments > 0 ? (job.processedDocuments / job.requestedDocuments) * 100 : 0}%`, backgroundColor: '#3b82f6' }}
              ></div>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-sm text-secondary">Status:</span>
                <span className="ml-2 text-info font-bold">Processing</span>
              </div>
              <button 
                className="btn btn-danger flex items-center" 
                onClick={handleStop}
                disabled={actionLoading || job.stopRequested}
              >
                <Square size={16} className="mr-2" /> 
                {job.stopRequested ? 'Stopping...' : 'Stop Processing'}
              </button>
            </div>
          </div>
        )}

        {job?.status === 'COMPLETED' && (
          <div className="border-l-4 border-success pl-4 py-2">
            <h3 className="text-success font-semibold flex items-center gap-2 mb-2">
              <CheckCircle size={18} /> Processing Completed Successfully
            </h3>
            <p className="text-secondary mb-1">{job.processedDocuments} documents processed so far in this batch</p>
            <ul className="text-sm text-secondary list-disc pl-5 mt-2 mb-3">
              <li>{job.newNarrativesAdded} new narratives added</li>
              <li>{job.existingNarrativesUpdated} existing narratives updated</li>
              <li>{job.claimsExtracted} claims extracted</li>
            </ul>
            <p className="text-xs text-muted mb-4">Completed at {new Date(job.completedAt).toLocaleTimeString()}</p>
            
            {remainingInBatch > 0 && (
              <div className="mt-4 pt-4 border-t">
                {limitInput}
                <button 
                  className="btn btn-primary flex items-center" 
                  onClick={handleStart}
                  disabled={actionLoading}
                >
                  <Play size={16} className="mr-2" /> Process Remaining Documents
                </button>
              </div>
            )}
          </div>
        )}

        {job?.status === 'FAILED' && (
          <div className="border-l-4 border-error pl-4 py-2">
            <h3 className="text-error font-semibold flex items-center gap-2 mb-2">
              <AlertTriangle size={18} /> Processing Failed
            </h3>
            <p className="text-secondary mb-2">{job.processedDocuments} / {job.totalDocuments} documents processed</p>
            <div className="bg-red-50 p-3 rounded text-sm text-red-800 mb-4 border border-red-100">
              <span className="font-semibold">Reason:</span> {job.error || 'Processing service encountered an error.'}
            </div>
            
            {remainingInBatch > 0 && (
              <div className="mt-4 pt-4 border-t">
                {limitInput}
                <button 
                  className="btn btn-primary flex items-center" 
                  onClick={handleStart}
                  disabled={actionLoading}
                >
                  <Play size={16} className="mr-2" /> Retry Processing
                </button>
              </div>
            )}
          </div>
        )}

        {job?.status === 'STOPPED' && (
          <div className="border-l-4 border-warning pl-4 py-2">
            <h3 className="text-warning font-semibold flex items-center gap-2 mb-2">
              <XCircle size={18} /> Processing Stopped
            </h3>
            <p className="text-secondary mb-1">{job.processedDocuments} / {job.requestedDocuments} requested processed</p>
            <p className="text-sm text-muted mb-4">Stopped by administrator.</p>
            
            {remainingInBatch > 0 && (
              <div className="mt-4 pt-4 border-t">
                {limitInput}
                <button 
                  className="btn btn-primary flex items-center" 
                  onClick={handleStart}
                  disabled={actionLoading}
                >
                  <Play size={16} className="mr-2" /> Resume Processing
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Processing;
