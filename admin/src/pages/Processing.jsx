import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { 
  Cpu, Play, CheckCircle, Clock, AlertTriangle, Square, XCircle, 
  RefreshCw, AlertCircle, Layers, Database, BarChart3, ArrowRight, Check
} from 'lucide-react';
import { useEntity } from '../context/EntityContext';

const Processing = () => {
  const { selectedEntity } = useEntity();
  const [stats, setStats] = useState(null);
  const [job, setJob] = useState(null);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [stopTimeoutWarning, setStopTimeoutWarning] = useState(false);
  const [stopError, setStopError] = useState(null);
  const [processLimit, setProcessLimit] = useState(0);

  const isMountedRef = useRef(true);
  const isFetchingRef = useRef(false);
  const stopTimerRef = useRef(null);
  const pollTimerRef = useRef(null);

  const fetchData = async (targetBatchId = selectedBatchId) => {
    if (!selectedEntity || isFetchingRef.current) return;
    isFetchingRef.current = true;
    
    try {
      const batchQuery = targetBatchId ? `&batch_id=${encodeURIComponent(targetBatchId)}` : '';
      const [statsRes, jobRes] = await Promise.all([
        axios.get(`/api/processing/status?entity_id=${selectedEntity.entityId}`, { withCredentials: true }),
        axios.get(`/api/processing/job-status?entity_id=${selectedEntity.entityId}${batchQuery}`, { withCredentials: true })
      ]);

      if (!isMountedRef.current) return;

      setStats(statsRes.data);
      const currentJob = jobRes.data;
      setJob(currentJob);
      
      if (currentJob?.batchId && !selectedBatchId) {
        setSelectedBatchId(currentJob.batchId);
      }
      
      // If job reached a terminal or stopped state, clear stopping indicator and watchdog
      if (currentJob && !['PROCESSING', 'STOP_REQUESTED'].includes(currentJob.status)) {
        setIsStopping(false);
        setStopTimeoutWarning(false);
        setStopError(null);
        if (stopTimerRef.current) {
          clearTimeout(stopTimerRef.current);
          stopTimerRef.current = null;
        }
      }

      if (currentJob && !['PROCESSING', 'STOP_REQUESTED'].includes(currentJob.status)) {
        const remaining = currentJob.unprocessedDocuments !== undefined
          ? currentJob.unprocessedDocuments
          : Math.max(0, currentJob.totalDocuments - currentJob.processedDocuments);

        setProcessLimit(prev => {
          if (currentJob.currentRunLimit && currentJob.currentRunLimit <= remaining && currentJob.currentRunLimit > 0) {
            return currentJob.currentRunLimit;
          }
          if (prev && prev > 0 && prev <= remaining) return prev;
          return remaining > 0 ? remaining : 0;
        });
      }
      
      setLoading(false);
    } catch (err) {
      if (isMountedRef.current) {
        console.error('Error fetching processing status:', err);
        setLoading(false);
      }
    } finally {
      isFetchingRef.current = false;
    }
  };

  // Mount effect & entity change effect: resets timers and fetches fresh status
  useEffect(() => {
    isMountedRef.current = true;
    setIsStopping(false);
    setStopTimeoutWarning(false);
    setStopError(null);
    setSelectedBatchId(null);
    fetchData();

    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    };
  }, [selectedEntity]);

  // Polling effect: actively polls ONLY while job is PROCESSING or STOP_REQUESTED
  useEffect(() => {
    const isActivelyActive = job && (
      job.status === 'PROCESSING' || 
      job.status === 'STOP_REQUESTED' || 
      job.stopRequested || 
      isStopping
    );

    if (isActivelyActive) {
      const schedulePoll = () => {
        pollTimerRef.current = setTimeout(async () => {
          if (isMountedRef.current) {
            await fetchData();
            if (isMountedRef.current && (
              job?.status === 'PROCESSING' || 
              job?.status === 'STOP_REQUESTED' || 
              job?.stopRequested || 
              isStopping
            )) {
              schedulePoll();
            }
          }
        }, 2000);
      };

      schedulePoll();

      return () => {
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      };
    } else {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    }
  }, [job?.status, job?.stopRequested, isStopping, selectedEntity, selectedBatchId]);

  const handleBatchSelect = (batchId) => {
    setSelectedBatchId(batchId);
    fetchData(batchId);
  };

  const handleStart = async () => {
    if (processLimit <= 0) {
      alert('Please specify a valid number of documents to process.');
      return;
    }
    setActionLoading(true);
    setIsStopping(false);
    setStopError(null);
    setStopTimeoutWarning(false);
    try {
      const res = await axios.post('/api/processing/start', { 
        batchId: selectedBatchId || job?.batchId, 
        limit: processLimit,
        entityId: selectedEntity.entityId
      }, { withCredentials: true });
      if (res.data?.job) {
        setJob(res.data.job);
        if (res.data.job.batchId) setSelectedBatchId(res.data.job.batchId);
      }
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Error starting processing.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async (force = false) => {
    if (actionLoading && !force) return;
    if (isStopping && !force && !stopTimeoutWarning) return;

    setActionLoading(true);
    setIsStopping(true);
    setStopError(null);

    // Optimistically show stopping status immediately
    setJob(prev => prev ? { ...prev, status: 'STOP_REQUESTED', stopRequested: true } : prev);

    // 15-second watchdog timer for cancellation confirmation
    if (!stopTimerRef.current) {
      stopTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setStopTimeoutWarning(true);
        }
      }, 15000);
    }

    try {
      const res = await axios.post('/api/processing/stop', { 
        entityId: selectedEntity.entityId,
        batchId: selectedBatchId || job?.batchId,
        force: Boolean(force)
      }, { withCredentials: true });

      if (res.data?.job) {
        setJob(res.data.job);
        if (res.data.job.status === 'CANCELLED' || res.data.job.status === 'STOPPED') {
          setIsStopping(false);
          setStopTimeoutWarning(false);
        }
      }
      await fetchData();
    } catch (err) {
      console.error('Stop request error:', err);
      setStopError('Stop request encountered an error. You may retry or force stop.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="p-6 text-secondary">Loading processing status...</div>;

  const isTerminalOrStopped = ['COMPLETED', 'FAILED', 'CANCELLED', 'STOPPED', 'IDLE', 'READY'].includes(job?.status);
  const isStopRequested = !isTerminalOrStopped && (job?.status === 'STOP_REQUESTED' || (job?.status === 'PROCESSING' && (job?.stopRequested || isStopping)));
  const isProcessing = !isTerminalOrStopped && (job?.status === 'PROCESSING' || isStopRequested);
  
  const remainingInBatch = job ? (
    job.unprocessedDocuments !== undefined 
      ? job.unprocessedDocuments 
      : Math.max(0, job.totalDocuments - job.processedDocuments)
  ) : 0;
  
  const getRunCounts = () => {
    if (!job) return { runLimit: 0, completedInRun: 0, runPercent: 0 };
    const runLimit = job.currentRunLimit > 0 
      ? job.currentRunLimit 
      : (job.requestedDocuments > 0 ? Math.min(job.totalDocuments, job.requestedDocuments) : job.totalDocuments);
    const startCount = job.requestedDocuments > 0 && job.currentRunLimit > 0
      ? Math.max(0, job.requestedDocuments - job.currentRunLimit)
      : 0;
    const completedInRun = Math.max(0, Math.min(runLimit, (job.processedDocuments || 0) - startCount));
    const runPercent = runLimit > 0 ? Math.min(100, Math.round((completedInRun / runLimit) * 100)) : 0;
    return { runLimit, completedInRun, runPercent };
  };

  const { runLimit, completedInRun, runPercent } = getRunCounts();

  const availableBatches = job?.availableBatches || [];

  return (
    <div className="pb-12">
      {/* Page Header */}
      <div className="flex flex-col mb-8">
        <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
          AI Processing Pipeline
        </h1>
        <p className="text-secondary" style={{ fontSize: '1.05rem', margin: 0 }}>
          Manage AI document processing, narrative extraction queues, and batch execution for <strong className="text-primary">{selectedEntity?.name || 'Selected Entity'}</strong>.
        </p>
      </div>

      {/* Pipeline Status Banner */}
      <div 
        className="rounded-2xl border mb-6 p-4.5 flex items-center justify-between gap-4 shadow-sm"
        style={{ 
          borderLeft: stats?.aiIntegrationEnabled ? '4px solid #10b981' : '4px solid #f59e0b',
          background: 'var(--surface-color-strong, #ffffff)',
          borderColor: 'var(--border-color)'
        }}
      >
        <div className="flex items-center gap-3.5">
          {stats?.aiIntegrationEnabled ? (
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
              <CheckCircle size={22} />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={22} />
            </div>
          )}
          <div>
            <h4 className="font-semibold text-sm m-0" style={{ color: stats?.aiIntegrationEnabled ? '#10b981' : '#f59e0b' }}>
              {stats?.aiIntegrationEnabled ? 'AI Pipeline Active & Connected' : 'AI Pipeline Initializing'}
            </h4>
            <p className="text-secondary text-xs mt-0.5 m-0 leading-normal">
              {stats?.message || "AI processing pipeline is connected and ready."}
            </p>
          </div>
        </div>
        <button 
          onClick={() => fetchData()} 
          className="btn btn-secondary text-xs flex items-center gap-1.5 text-secondary hover:text-primary px-3 py-1.5 h-9 rounded-lg"
          title="Refresh processing status"
        >
          <RefreshCw size={14} className={actionLoading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Global Statistics Grid (Compact Horizontal Layout) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        {/* Total Database Records */}
        <div className="metric-card-horizontal">
          <div className="metric-icon-wrap bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
            <Database size={20} />
          </div>
          <div className="metric-body">
            <span className="metric-label">Total Records</span>
            <div className="metric-num-row">
              <span className="metric-num">{stats?.total || 0}</span>
              <span className="metric-sub">in database</span>
            </div>
          </div>
        </div>

        {/* Global Unprocessed */}
        <div className="metric-card-horizontal">
          <div className="metric-icon-wrap bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
            <Clock size={20} />
          </div>
          <div className="metric-body">
            <span className="metric-label">Global Unprocessed</span>
            <div className="metric-num-row">
              <span className="metric-num text-amber-600 dark:text-amber-400">
                {(stats?.breakdown?.not_processed || 0) + (stats?.breakdown?.pending || 0)}
              </span>
              <span className="metric-sub text-amber-600/80 dark:text-amber-400/80">awaiting run</span>
            </div>
          </div>
        </div>

        {/* Global Processing */}
        <div className="metric-card-horizontal">
          <div className="metric-icon-wrap bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
            <Cpu size={20} className={(stats?.breakdown?.processing || 0) > 0 ? 'animate-pulse' : ''} />
          </div>
          <div className="metric-body">
            <span className="metric-label">Global Processing</span>
            <div className="metric-num-row">
              <span className="metric-num text-indigo-600 dark:text-indigo-400">
                {stats?.breakdown?.processing || 0}
              </span>
              <span className="metric-sub text-indigo-600/80 dark:text-indigo-400/80">in progress</span>
            </div>
          </div>
        </div>

        {/* Global Completed */}
        <div className="metric-card-horizontal">
          <div className="metric-icon-wrap bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <CheckCircle size={20} />
          </div>
          <div className="metric-body">
            <span className="metric-label">Global Completed</span>
            <div className="metric-num-row">
              <span className="metric-num text-emerald-600 dark:text-emerald-400">
                {stats?.breakdown?.completed || 0}
              </span>
              <span className="metric-sub text-emerald-600/80 dark:text-emerald-400/80">extracted</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Processing Queue & Batch Management Card */}
      <div className="card p-6 shadow-sm mb-6" style={{ background: 'var(--surface-color-strong, #ffffff)', borderColor: 'var(--border-color)' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div>
            <h2 className="text-base font-bold m-0" style={{ color: 'var(--text-primary)' }}>Current Processing Queue</h2>
            <p className="text-secondary text-xs mt-0.5 m-0">Target individual batches or execute entity-wide queue.</p>
          </div>

          {/* Batch Selector if multiple batches exist */}
          {availableBatches.length > 0 && (
            <div className="flex items-center gap-2.5">
              <label htmlFor="batch-select" className="text-xs font-semibold text-secondary whitespace-nowrap">
                Select Batch:
              </label>
              <select
                id="batch-select"
                className="control-standard"
                style={{ 
                  width: 'auto',
                  minWidth: '220px', 
                  maxWidth: '340px' 
                }}
                value={selectedBatchId || job?.batchId || ''}
                onChange={(e) => handleBatchSelect(e.target.value)}
                disabled={isProcessing}
              >
                {availableBatches.map(b => (
                  <option key={b.batchId} value={b.batchId}>
                    {b.batchId} ({b.unprocessedDocuments} unprocessed, {b.totalDocuments} total - {b.status})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Empty Batch State */}
        {(!job || job.status === 'IDLE') && (
          <div className="text-center py-10">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 text-secondary mx-auto flex items-center justify-center mb-3">
              <Layers size={24} />
            </div>
            <h4 className="font-semibold text-base mb-1" style={{ color: 'var(--text-primary)' }}>No Active Batch in Queue</h4>
            <p className="text-secondary text-sm max-w-md mx-auto mb-4">
              Upload a CSV file, scrape live web articles, or ingest YouTube comments to queue documents for Narrative Intelligence extraction.
            </p>
          </div>
        )}

        {/* Active Batch Summary Strip */}
        {job && job.status !== 'IDLE' && (
          <div className="mb-5">
            {/* Header info badge strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-t-xl border border-b-0" style={{ background: 'var(--surface-color-soft)', borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-100/70 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">
                  Batch: {job.batchId || 'N/A'}
                </span>
                <span className="text-xs text-secondary">
                  <strong>Created:</strong> {job.createdAt ? new Date(job.createdAt).toLocaleString() : 'N/A'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {job.requestedDocuments > 0 && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-secondary">
                    Target: {job.requestedDocuments} docs
                  </span>
                )}
                {job.failedDocuments > 0 && (
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300">
                    Failed: {job.failedDocuments} docs
                  </span>
                )}
                <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold ${
                  job.status === 'COMPLETED' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' :
                  job.status === 'FAILED' ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300' :
                  ['STOPPED', 'CANCELLED'].includes(job.status) ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' :
                  isStopRequested ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 animate-pulse' :
                  job.status === 'PROCESSING' ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 animate-pulse' :
                  'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                }`}>
                  {isStopRequested ? 'STOPPING...' : job.status}
                </span>
              </div>
            </div>

            {/* 2-Column Balanced Statistics Layout on Desktop, Responsive on Mobile */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 rounded-b-xl border" style={{ background: 'var(--surface-color-soft)', borderColor: 'var(--border-color)' }}>
              {/* Row 1 / Col 1: Total in Batch */}
              <div className="p-3 rounded-lg border flex items-center justify-between" style={{ background: 'var(--surface-color-strong)', borderColor: 'var(--border-color)' }}>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-secondary block">Total in Batch</span>
                  <span className="text-xs text-muted">All documents queued in this batch</span>
                </div>
                <strong className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>
                  {job.totalDocuments}
                </strong>
              </div>

              {/* Row 1 / Col 2: Completed in Batch */}
              <div className="p-3 rounded-lg border flex items-center justify-between" style={{ background: 'var(--surface-color-strong)', borderColor: 'var(--border-color)' }}>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-secondary block">Completed in Batch</span>
                  <span className="text-xs text-muted">Successfully extracted narratives</span>
                </div>
                <strong className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  {job.processedDocuments} / {job.totalDocuments}
                </strong>
              </div>

              {/* Row 2 / Col 1: Unprocessed in Batch */}
              <div className="p-3 rounded-lg border flex items-center justify-between" style={{ background: 'var(--surface-color-strong)', borderColor: 'var(--border-color)' }}>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-secondary block">Unprocessed in Batch</span>
                  <span className="text-xs text-muted">Awaiting extraction run</span>
                </div>
                <strong className={`text-2xl font-extrabold ${remainingInBatch > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-secondary'}`}>
                  {remainingInBatch}
                </strong>
              </div>

              {/* Row 2 / Col 2: Batch Progress & Status */}
              <div className="p-3 rounded-lg border flex items-center justify-between" style={{ background: 'var(--surface-color-strong)', borderColor: 'var(--border-color)' }}>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-secondary block">Batch Progress</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-muted">Status:</span>
                    <span className="text-xs font-bold text-primary">{isStopRequested ? 'STOPPING...' : job.status}</span>
                  </div>
                </div>
                <strong className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                  {job.totalDocuments > 0 ? Math.round(((job.processedDocuments || 0) / job.totalDocuments) * 100) : 0}%
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* Action Controls: Ready / Partially Processed – Target Configuration */}
        {!isProcessing && remainingInBatch > 0 && (
          <div className="p-4 rounded-xl border mb-2" style={{ background: 'var(--surface-color-soft)', borderColor: 'var(--border-color)' }}>
            <div className="mb-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold m-0" style={{ color: 'var(--text-primary)' }}>
                  Configure Run Target
                </h4>
                {job.processedDocuments > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                    Run chunk completed: {job.processedDocuments}/{job.totalDocuments} processed
                  </span>
                )}
              </div>
              <p className="text-xs text-secondary mt-0.5 m-0">
                {job.processedDocuments > 0 
                  ? `Previous chunk finished successfully. ${remainingInBatch} documents remaining in this batch. Select next target to continue processing.`
                  : `Specify how many unprocessed documents to process in this run (max ${remainingInBatch} remaining).`}
              </p>
            </div>
            
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-secondary whitespace-nowrap">
                    Documents:
                  </label>
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
                    className="control-standard text-center font-bold w-20 shadow-sm"
                    style={{ height: '40px' }}
                  />
                </div>

                {/* Quick Limit Preset Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {remainingInBatch > 5 && (
                    <button 
                      type="button" 
                      className={`btn shadow-sm text-xs font-semibold ${processLimit === 5 ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ height: '40px', padding: '0 0.875rem', borderRadius: '8px' }}
                      onClick={() => setProcessLimit(Math.min(5, remainingInBatch))}
                    >
                      Set to 5
                    </button>
                  )}
                  {remainingInBatch > 15 && (
                    <button 
                      type="button" 
                      className={`btn shadow-sm text-xs font-semibold ${processLimit === 15 ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ height: '40px', padding: '0 0.875rem', borderRadius: '8px' }}
                      onClick={() => setProcessLimit(Math.min(15, remainingInBatch))}
                    >
                      Set to 15
                    </button>
                  )}
                  {remainingInBatch >= 30 && (
                    <button 
                      type="button" 
                      className={`btn shadow-sm text-xs font-semibold ${processLimit === 30 ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ height: '40px', padding: '0 0.875rem', borderRadius: '8px' }}
                      onClick={() => setProcessLimit(30)}
                    >
                      Set to 30
                    </button>
                  )}
                  <button 
                    type="button" 
                    className={`btn shadow-sm text-xs font-semibold ${processLimit === remainingInBatch ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ height: '40px', padding: '0 0.875rem', borderRadius: '8px' }}
                    onClick={() => setProcessLimit(remainingInBatch)}
                  >
                    All ({remainingInBatch})
                  </button>
                </div>
              </div>

              <div className="flex items-center shrink-0">
                <button 
                  className="btn btn-primary shadow-sm flex items-center gap-2 font-semibold" 
                  onClick={handleStart}
                  disabled={actionLoading || processLimit <= 0}
                  style={{ height: '40px', padding: '0 1.25rem', borderRadius: '8px', opacity: actionLoading ? 0.7 : 1 }}
                >
                  <Play size={16} /> 
                  <span>{actionLoading ? 'Starting Execution...' : `Start Processing (${processLimit || 0} Documents)`}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Actively Processing / Stopping View */}
        {isProcessing && (
          <div className="p-4.5 rounded-xl border mb-4" style={{ background: 'var(--surface-color-soft)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-sm" style={{ color: isStopRequested ? '#f59e0b' : 'var(--text-primary)' }}>
                {isStopRequested ? 'Cancellation in progress...' : 'AI Processing Active'}
              </span>
              <span className="text-xs font-semibold text-secondary">
                {completedInRun} of {runLimit} documents completed in this run ({runPercent}%)
              </span>
            </div>

            {/* Smooth Progress Bar */}
            <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-3 mb-4 overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-500 ease-out" 
                style={{ 
                  width: `${runPercent}%`, 
                  backgroundColor: isStopRequested ? '#f59e0b' : '#3b82f6' 
                }}
              />
            </div>

            {/* Warnings and Fallbacks */}
            {stopError && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-3 rounded-lg mb-4 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                  <span>{stopError}</span>
                </div>
                <button
                  className="btn btn-secondary text-xs px-3 h-8 rounded-md font-semibold ml-2"
                  onClick={() => handleStop(true)}
                >
                  Force Stop
                </button>
              </div>
            )}

            {stopTimeoutWarning && !stopError && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 p-3 rounded-lg mb-4 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
                  <span>Cancellation is taking longer than expected. You can wait for the active AI task to release or force stop now.</span>
                </div>
                <button
                  className="btn btn-danger text-xs px-3.5 h-8 rounded-md font-semibold ml-2"
                  onClick={() => handleStop(true)}
                  disabled={actionLoading}
                >
                  Force Stop Now
                </button>
              </div>
            )}

            {/* Controls Bar */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-secondary">
                {isStopRequested 
                  ? 'Waiting for active background LLM requests to terminate safely...' 
                  : `Processing chunk in batches with rate-limit protection...`}
              </div>
              <button 
                className="btn btn-danger flex items-center px-4 h-10 text-xs font-bold rounded-lg shadow-sm" 
                onClick={() => handleStop(false)}
                disabled={actionLoading || isStopRequested}
                style={{ opacity: isStopRequested ? 0.7 : 1 }}
              >
                <Square size={14} className="mr-1.5" /> 
                {isStopRequested ? 'Stopping...' : 'Stop Processing'}
              </button>
            </div>
          </div>
        )}

        {/* Batch Completed State */}
        {job?.status === 'COMPLETED' && remainingInBatch === 0 && (
          <div className="border-l-4 border-emerald-500 pl-4 py-2 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <h4 className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-2 mb-1.5 text-sm">
              <CheckCircle size={16} /> Batch Completed Successfully
            </h4>
            <p className="text-secondary text-xs mb-2">
              All {job.processedDocuments} of {job.totalDocuments} documents in this batch have been fully processed.
            </p>
            <div className="flex flex-wrap gap-4 text-xs text-secondary mb-3">
              <span><strong>New Narratives:</strong> {job.newNarrativesAdded}</span>
              <span><strong>Updated Narratives:</strong> {job.existingNarrativesUpdated}</span>
              <span><strong>Claims Extracted:</strong> {job.claimsExtracted}</span>
            </div>

            {/* If there are other batches with unprocessed documents, offer seamless switch */}
            {availableBatches.some(b => b.batchId !== job.batchId && b.unprocessedDocuments > 0) && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-800 dark:text-blue-300 flex items-center justify-between">
                <span>Other batches have unprocessed documents waiting in queue.</span>
                <button
                  className="btn btn-primary text-xs px-3 h-8 rounded-md"
                  onClick={() => {
                    const nextBatch = availableBatches.find(b => b.batchId !== job.batchId && b.unprocessedDocuments > 0);
                    if (nextBatch) handleBatchSelect(nextBatch.batchId);
                  }}
                >
                  Switch to Next Batch ({availableBatches.find(b => b.batchId !== job.batchId && b.unprocessedDocuments > 0)?.unprocessedDocuments} docs)
                </button>
              </div>
            )}
          </div>
        )}

        {/* Cancelled / Stopped State */}
        {['STOPPED', 'CANCELLED'].includes(job?.status) && (
          <div className="border-l-4 border-amber-500 pl-4 py-2 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <h4 className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-2 mb-1.5 text-sm">
              <XCircle size={16} /> {job.status === 'CANCELLED' ? 'Processing Cancelled' : 'Processing Stopped'}
            </h4>
            <p className="text-secondary text-xs mb-2">
              {job.cancellationReason || 'Processing was halted by user request.'} {job.processedDocuments} of {job.totalDocuments} total documents completed.
            </p>

            {remainingInBatch > 0 && (
              <div className="mt-3 p-4 rounded-xl border" style={{ background: 'var(--surface-color-soft)', borderColor: 'var(--border-color)' }}>
                <h5 className="font-semibold text-xs mb-2" style={{ color: 'var(--text-primary)' }}>
                  Resume Remaining Documents ({remainingInBatch} unprocessed)
                </h5>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-secondary whitespace-nowrap">
                        Documents:
                      </label>
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
                        className="border rounded-lg px-3 text-center text-sm font-bold shadow-sm h-10 w-20"
                        style={{ background: 'var(--surface-color-strong, #ffffff)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {remainingInBatch > 5 && (
                        <button 
                          type="button" 
                          className={`btn shadow-sm text-xs px-3 h-10 rounded-lg font-semibold ${processLimit === 5 ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setProcessLimit(Math.min(5, remainingInBatch))}
                        >
                          Set to 5
                        </button>
                      )}
                      <button 
                        type="button" 
                        className={`btn shadow-sm text-xs px-3.5 h-10 rounded-lg font-semibold ${processLimit === remainingInBatch ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setProcessLimit(remainingInBatch)}
                      >
                        All ({remainingInBatch})
                      </button>
                    </div>
                  </div>

                  <button 
                    className="btn btn-primary text-xs flex items-center px-4 h-10 rounded-lg font-bold shadow-sm shrink-0" 
                    onClick={handleStart}
                    disabled={actionLoading || processLimit <= 0}
                  >
                    <Play size={14} className="mr-1.5" /> 
                    {actionLoading ? 'Starting...' : 'Process Remaining'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Source-Wise Document & Status Breakdown Table */}
      {stats?.sourceBreakdown && stats.sourceBreakdown.length > 0 && (
        <div className="card p-6 shadow-sm" style={{ background: 'var(--surface-color-strong, #ffffff)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between mb-4 border-b pb-3" style={{ borderColor: 'var(--border-color)' }}>
            <div>
              <h3 className="text-base font-bold m-0" style={{ color: 'var(--text-primary)' }}>Source-Wise Document & Processing Audit</h3>
              <p className="text-secondary text-xs mt-0.5 m-0">Live authoritative reconciliation of all {stats.total} database records by source channel.</p>
            </div>
            <span className="badge badge-outline text-xs">
              {stats.sourceBreakdown.length} Sources Connected
            </span>
          </div>

          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Source Name</th>
                  <th style={{ textAlign: 'right', width: '12%' }}>Total Records</th>
                  <th style={{ textAlign: 'right', width: '12%' }}>Completed</th>
                  <th style={{ textAlign: 'right', width: '12%' }}>Unprocessed</th>
                  <th style={{ textAlign: 'right', width: '12%' }}>Processing</th>
                  <th style={{ textAlign: 'right', width: '12%' }}>Failed</th>
                  <th style={{ textAlign: 'center', width: '12%' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.sourceBreakdown.map((src, i) => {
                  const isAllDone = src.total > 0 && src.completed === src.total;
                  return (
                    <tr key={i}>
                      <td className="font-semibold text-primary">
                        {src.source}
                      </td>
                      <td style={{ textAlign: 'right' }} className="font-bold">
                        {src.total}
                      </td>
                      <td style={{ textAlign: 'right' }} className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        {src.completed}
                      </td>
                      <td style={{ textAlign: 'right' }} className="text-amber-600 dark:text-amber-400 font-semibold">
                        {src.unprocessed}
                      </td>
                      <td style={{ textAlign: 'right' }} className="text-indigo-600 dark:text-indigo-400 font-semibold">
                        {src.processing}
                      </td>
                      <td style={{ textAlign: 'right' }} className="text-red-600 dark:text-red-400 font-semibold">
                        {src.failed}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          isAllDone ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' :
                          src.unprocessed > 0 ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300' :
                          'bg-gray-100 dark:bg-gray-800 text-secondary'
                        }`}>
                          {isAllDone ? 'Completed' : `${src.unprocessed} Pending`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total Reconciled</td>
                  <td style={{ textAlign: 'right' }}>{stats.total}</td>
                  <td style={{ textAlign: 'right' }} className="text-emerald-600 dark:text-emerald-400">
                    {stats.breakdown?.completed || 0}
                  </td>
                  <td style={{ textAlign: 'right' }} className="text-amber-600 dark:text-amber-400">
                    {(stats.breakdown?.not_processed || 0) + (stats.breakdown?.pending || 0)}
                  </td>
                  <td style={{ textAlign: 'right' }} className="text-indigo-600 dark:text-indigo-400">
                    {stats.breakdown?.processing || 0}
                  </td>
                  <td style={{ textAlign: 'right' }} className="text-red-600 dark:text-red-400">
                    {stats.breakdown?.failed || 0}
                  </td>
                  <td style={{ textAlign: 'center' }} className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                    100% Balanced
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Processing;
