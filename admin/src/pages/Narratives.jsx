import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useEntity } from '../context/EntityContext';
import api from '../services/api';

const actions = [
  ['publish', 'Publish'], ['hold', 'Hold'], ['reject', 'Reject'], ['unpublish', 'Unpublish'],
];

export default function Narratives() {
  const { selectedEntity } = useEntity();
  const [items, setItems] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [status, setStatus] = useState('All');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = selectedEntity ? { entity_id: selectedEntity.entityId } : {};
      const [narrativeResponse, alertResponse] = await Promise.all([
        api.get('/admin/narratives', { params }),
        api.get('/admin/alerts', { params }),
      ]);
      setItems(narrativeResponse.data);
      setAlerts(alertResponse.data);
      setSelected([]);
      setError('');
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load narratives.');
    } finally { setLoading(false); }
  }, [selectedEntity]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const params = selectedEntity ? { entity_id: selectedEntity.entityId } : {};
    const timer = setInterval(() => {
      api.get('/admin/alerts', { params }).then(({ data }) => setAlerts(data)).catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [selectedEntity]);

  const visible = useMemo(() => status === 'All' ? items : items.filter(item => (item.publicationStatus || 'Pending Review') === status), [items, status]);
  const act = async (id, action) => {
    try { await api.put(`/admin/narratives/${id}/${action}`); await load(); }
    catch (e) { setError(e.response?.data?.message || `Could not ${action} narrative.`); }
  };

  const bulkPublish = async () => {
    try { await api.put('/admin/narratives/bulk-publish', { ids: selected }); await load(); }
    catch (e) { setError(e.response?.data?.message || 'Could not publish selected narratives.'); }
  };

  const updateAlert = async (id, nextStatus) => {
    try { await api.put(`/admin/alerts/${id}/status`, { status: nextStatus }); await load(); }
    catch (e) { setError(e.response?.data?.message || 'Could not update alert.'); }
  };

  const toggle = id => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const toggleAll = () => setSelected(selected.length === visible.length ? [] : visible.map(item => item._id));

  return <section>
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div><h1>Narrative review</h1><p className="text-secondary">Review AI findings before they appear to users.</p></div>
      <div className="flex items-center gap-3"><select className="form-control" value={status} onChange={e => setStatus(e.target.value)}>
        {['All', 'Pending Review', 'Published', 'Held', 'Rejected'].map(value => <option key={value}>{value}</option>)}
      </select><button className="btn btn-secondary" onClick={load}><RefreshCw size={16} /> Refresh</button></div>
    </div>
    {error && <div className="card mb-4" role="alert" style={{ color: 'var(--status-error)' }}>{error}</div>}
    <section className="mb-8" aria-label="Security alerts">
      <div className="flex items-center gap-2 mb-3"><AlertCircle size={20} style={{ color: '#b91c1c' }} /><h2>Security alerts</h2><span className="text-secondary text-sm">{alerts.length} open or confirmed</span></div>
      <p className="text-secondary text-sm mb-4">Automated signals are for human review; they do not establish that an incident occurred.</p>
      {alerts.length === 0 ? <div className="card text-secondary">No open security alerts.</div> : <div className="grid gap-3">
        {alerts.map(alert => <article className="card" key={alert._id} style={{ borderLeft: `4px solid ${alert.severity === 'critical' ? '#dc2626' : '#f97316'}` }}>
          <div className="flex flex-wrap items-start justify-between gap-4"><div>
            <div className="flex flex-wrap items-center gap-2"><strong>{alert.title}</strong><span className="badge">{alert.severity}</span><span className="badge">{alert.status}</span><span className="text-secondary text-sm">{alert.eventType.replaceAll('_', ' ')}</span></div>
            <p className="mt-2">{alert.summary || alert.narrative?.description}</p><p className="text-secondary text-sm mt-2">{alert.reason}</p>
            <p className="text-secondary text-xs mt-2">Detected {alert.lastTriggeredAt ? new Date(alert.lastTriggeredAt).toLocaleString() : 'recently'} · {alert.occurrenceCount || 1} distinct evidence updates · signal score {Math.round((alert.confidence || 0) * 100)}% (heuristic, not truth probability)</p>
          </div><div className="flex flex-wrap gap-2">{['Confirmed', 'Unsubstantiated', 'Duplicate', 'Resolved'].map(value => <button key={value} className="btn btn-secondary" onClick={() => updateAlert(alert._id, value)}>{value}</button>)}</div></div>
          {alert.evidence?.length > 0 && <div className="grid gap-2 mt-4">{alert.evidence.map(source => <div className="rounded border p-3 text-sm" key={source.documentId || source.url || source.title}>
            <div className="flex flex-wrap justify-between gap-2"><strong>{source.title || source.source}</strong><span className="text-secondary">{source.sourceType} · {source.publishedAt ? new Date(source.publishedAt).toLocaleDateString() : 'date unknown'}</span></div>
            {source.excerpt && <p className="text-secondary mt-2">{source.excerpt}</p>}
            {source.url && <a href={source.url} target="_blank" rel="noreferrer" className="inline-block mt-2">Open source</a>}
          </div>)}</div>}
        </article>)}
      </div>}
    </section>
    <div className="flex items-center gap-3 mb-4"><button className="btn btn-primary" disabled={!selected.length} onClick={bulkPublish}>Publish selected ({selected.length})</button><span className="text-secondary text-sm">{items.length} narratives</span></div>
    {loading ? <p className="text-secondary">Loading narratives…</p> : visible.length === 0 ? <div className="card text-secondary">No narratives in this status.</div> : <div className="grid gap-4">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visible.length > 0 && selected.length === visible.length} onChange={toggleAll} /> Select all shown</label>
      {visible.map(item => <article className="card" key={item._id} style={{ borderLeft: `4px solid ${item.severityLevel === 'critical' ? '#dc2626' : item.severityLevel === 'high' ? '#f97316' : 'var(--border-color, #e5e7eb)'}` }}>
        <div className="flex flex-wrap justify-between gap-4">
          <div className="flex gap-3 min-w-0"><input aria-label={`Select ${item.description}`} type="checkbox" checked={selected.includes(item._id)} onChange={() => toggle(item._id)} />
            <div><h2 className="text-lg font-semibold">{item.description}</h2><p className="text-secondary text-sm mt-1">{item.topic || 'General'} · {item.entityId} · {item.lastObservedAt ? new Date(item.lastObservedAt).toLocaleDateString() : 'Date unavailable'}</p>
              {item.intelligence && <p className="mt-3 whitespace-pre-wrap">{item.intelligence}</p>}
              <p className="text-secondary text-sm mt-2">{item.analysis?.source_count || 0} sources · {item.analysis?.claim_count || 0} claims · Severity: <strong>{item.severityLevel || 'normal'}</strong> · {item.publicationStatus || 'Pending Review'}</p>
              {item.severityReason && <p className="text-sm mt-1">{item.severityReason}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">{actions.map(([action, label]) => {
            if (action === 'unpublish' && !item.isPublished) return null;
            if (action !== 'unpublish' && item.isPublished && action === 'publish') return null;
            return <button key={action} className={`btn ${action === 'publish' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => act(item._id, action)}>{label}</button>;
          })}</div>
        </div>
      </article>)}
    </div>}
  </section>;
}
