import axios from 'axios';

const rawApiUrl = (import.meta.env?.VITE_API_URL || '').trim().replace(/\/+$/, '');
const baseURL = rawApiUrl
  ? (rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`)
  : '/api';

const api = axios.create({
  baseURL,
  withCredentials: true,
});

export const toArray = (value, nestedKey) => {
  if (Array.isArray(value)) return value;
  if (nestedKey && Array.isArray(value?.[nestedKey])) return value[nestedKey];
  if (Array.isArray(value?.data)) return value.data;
  return [];
};

export const fetchDomains = async () => {
  const res = await api.get('/domains');
  return toArray(res.data, 'domains');
};

export const fetchEntities = async () => {
  const res = await api.get('/entities');
  return toArray(res.data, 'entities');
};

export const fetchEntityNarratives = async (entityId, params = {}) => {
  const queryParams = entityId ? { entity_id: entityId, ...params } : { ...params };
  const res = await api.get('/narratives', { params: queryParams });
  return toArray(res.data, 'narratives');
};

export const fetchEntityHighlights = async (entityId) => {
  if (!entityId) return { negative: [], positive: [] };
  const res = await api.get('/narratives/highlights', { params: { entity_id: entityId } });
  return {
    negative: toArray(res.data?.negative),
    positive: toArray(res.data?.positive),
  };
};

export const fetchEntityTopics = async (entityId) => {
  if (!entityId) return [];
  const res = await api.get('/topics', { params: { entity_id: entityId } });
  return toArray(res.data, 'topics');
};

export const fetchEntityStats = async (entityId) => {
  if (!entityId) {
    return {
      totalDocuments: 0,
      processedDocuments: 0,
      activeSources: 0,
      totalNarratives: 0,
      topicCount: 0,
      criticalCount: 0,
      sentimentBreakdown: { positive: 0, negative: 0, neutral: 0, mixed: 0 },
    };
  }
  try {
    const res = await api.get(`/entities/${encodeURIComponent(entityId)}/stats`);
    return res.data;
  } catch {
    // Fallback to separate read endpoints if /entities/:id/stats is unavailable
    const [allDocsRes, completedDocsRes, sourcesRes] = await Promise.all([
      api.get('/documents', { params: { entity_id: entityId, limit: 1 } }).catch(() => ({ data: { total: 0 } })),
      api.get('/documents', { params: { entity_id: entityId, status: 'completed', limit: 1 } }).catch(() => ({ data: { total: 0 } })),
      api.get('/sources', { params: { entity_id: entityId } }).catch(() => ({ data: [] })),
    ]);
    return {
      totalDocuments: Number(allDocsRes.data?.total ?? 0),
      processedDocuments: Number(completedDocsRes.data?.total ?? 0),
      activeSources: toArray(sourcesRes.data, 'sources').length,
      totalNarratives: null,
      topicCount: null,
      criticalCount: null,
      sentimentBreakdown: null,
    };
  }
};

export default api;
