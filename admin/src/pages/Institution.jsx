import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, Sparkles } from 'lucide-react';
import { useParams } from 'react-router-dom';
import api from '../services/api';

const dateLabel = (value) => value ? new Date(value).toLocaleDateString() : 'Date not provided';

export default function Institution() {
  const { entityId } = useParams();
  const [overview, setOverview] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [narratives, setNarratives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (entityId !== 'ENT_45528e0f') { setLoading(false); return; }
    try {
      const [summary, history, analysis] = await Promise.all([
        api.get('/institutions/nit-raipur'),
        api.get('/institutions/nit-raipur/jobs'),
        api.get('/narratives', { params: { entity_id: entityId } }),
      ]);
      setOverview(summary.data); setJobs(history.data); setNarratives(analysis.data || []); setError('');
    } catch (e) { setError(e.response?.data?.message || 'Could not load NIT Raipur intelligence.'); }
    finally { setLoading(false); }
  }, [entityId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!jobs.some(j => ['pending', 'running'].includes(j.status))) return undefined;
    const timer = setInterval(load, 4000); return () => clearInterval(timer);
  }, [jobs, load]);

  const start = async () => {
    setStarting(true); setError('');
    try { await api.post('/institutions/nit-raipur/scrape'); await load(); }
    catch (e) { setError(e.response?.data?.message || 'Could not start collection.'); }
    finally { setStarting(false); }
  };

  if (loading) return <p className="text-secondary">Loading institutional intelligence…</p>;
  if (entityId !== 'ENT_45528e0f') return <p className="text-secondary">NIT Raipur web scraping is available only on the selected Education entity.</p>;
  const metrics = overview?.metrics || {};
  const metricCards = [
    ['Collected documents', metrics.total || 0], ['Official website', metrics.official || 0],
    ['External news', metrics.news || 0], ['Analyzed', metrics.analyzed || 0],
    ['Pending analysis', metrics.pending || 0], ['Analysis failures', metrics.failed || 0],
  ];
  const active = jobs.some(j => ['pending', 'running'].includes(j.status));

  return <div style={{ maxWidth: 1240, margin: '0 auto' }}>
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div><p className="text-secondary mb-2">Education / NIT Raipur by Scraping</p><h1>Institutional intelligence</h1>
        <p className="text-secondary">Evidence linked to official NIT Raipur sources and external news coverage.</p></div>
      <button className="btn btn-primary" onClick={start} disabled={starting || active}>
        <RefreshCw size={17} />{starting ? 'Starting…' : active ? 'Collection running' : 'Scrape NIT Raipur'}
      </button>
    </div>
    {error && <div className="card mb-5" role="alert" style={{ borderColor: 'var(--status-error)', color: 'var(--status-error)' }}>{error}</div>}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {metricCards.map(([label, value]) => <div className="card" key={label}><p className="text-secondary">{label}</p><strong style={{ fontSize: '1.8rem' }}>{value}</strong></div>)}
    </div>
    <div className="card mb-6">
      <div className="flex items-center justify-between mb-4"><h2>Collection history</h2><span className="text-secondary text-sm">Latest successful collection: {dateLabel(metrics.latest)}</span></div>
      {jobs.length ? <div style={{ overflowX: 'auto' }}><table className="w-full"><thead><tr><th align="left">Started</th><th align="left">Status</th><th align="left">Found</th><th align="left">Inserted / updated</th><th align="left">Analysis progress</th><th align="left">Details</th></tr></thead><tbody>
        {jobs.map(job => <tr key={job._id}><td>{dateLabel(job.startedAt || job.createdAt)}</td><td>{job.status}</td><td>{job.documentsDiscovered}</td><td>{job.documentsInserted} / {job.documentsUpdated}</td><td>{job.analysisJobId ? `${job.analysisJobId.status} · ${job.analysisJobId.processedDocuments}/${job.analysisJobId.requestedDocuments}` : 'No text queued'}</td><td><div>{job.summary || 'Collection in progress'}</div>{job.errors?.length > 0 && <ul className="mt-2 text-sm" style={{ paddingLeft: '1.2rem', color: 'var(--status-error)' }}>{job.errors.map((message, index) => <li key={`${job._id}-error-${index}`}>{message}</li>)}</ul>}</td></tr>)}
      </tbody></table></div> : <p className="text-secondary">No collection runs yet. Start a manual scrape to gather source material.</p>}
    </div>
    <div className="card mb-6">
      <div className="flex items-center gap-2 mb-4"><Sparkles size={18} /><h2>Current narratives</h2></div>
      {narratives.length ? <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{narratives.slice(0, 8).map(item => <article className="card" key={item._id}>
        <span className="text-secondary text-sm">{item.topic || 'Institutional theme'}</span><h3>{item.description || 'Narrative'}</h3>
        <p>{item.intelligence || 'No intelligence summary is available.'}</p>
        <p className="text-secondary text-sm">Evidence: {item.supportingEvidence?.document_ids?.length || 0} documents · strength {item.analysis?.strength ?? 'not scored'}</p>
        {item.supportingEvidence?.document_ids?.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{item.supportingEvidence.document_ids.map(id => {
          const evidence = overview?.documents?.find(doc => String(doc._id) === String(id));
          return evidence?.url ? <a className="text-sm" key={id} href={evidence.url} target="_blank" rel="noreferrer">{evidence.title || 'Supporting source'} ↗</a> : null;
        })}</div>}
      </article>)}</div> : <p className="text-secondary">Narratives appear here after documents are analyzed. No findings are inferred from an empty dataset.</p>}
    </div>
    <div className="card">
      <h2 className="mb-4">Collected source documents</h2>
      {overview?.documents?.length ? <div className="grid grid-cols-1 gap-3">{overview.documents.map(doc => <article key={doc._id} className="border rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3>{doc.title || 'Untitled source'}</h3><p className="text-secondary text-sm">{doc.source} · {doc.sourceType} · {dateLabel(doc.publicationDate)} · {doc.processingStatus}</p></div>
          {doc.url && <a href={doc.url} target="_blank" rel="noreferrer" aria-label={`Open source: ${doc.title}`}><ExternalLink size={18} /></a>}</div>
        {doc.rawText && <p className="mt-3 text-secondary">{doc.rawText.slice(0, 420)}{doc.rawText.length > 420 ? '…' : ''}</p>}
      </article>)}</div> : <p className="text-secondary">No documents collected yet.</p>}
    </div>
  </div>;
}
