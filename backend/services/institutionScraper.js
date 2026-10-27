import axios from 'axios';
import crypto from 'node:crypto';

const ROOT = process.env.NITRR_SITE_URL || 'https://www.nitrr.ac.in/';
const GDELT_ENDPOINT = process.env.GDELT_DOC_URL || 'https://api.gdeltproject.org/api/v2/doc/doc';
const HOSTS = new Set(['nitrr.ac.in', 'www.nitrr.ac.in']);
const MAX_PAGES = Math.min(Number(process.env.NITRR_MAX_PAGES) || 30, 60);
const MAX_BYTES = 8 * 1024 * 1024;
const headers = { 'User-Agent': 'NarrativeIntelligenceResearchBot/1.0 (public institutional research)' };
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function gdeltRequest(endpoint, params) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await axios.get(endpoint, { params, timeout: 20000, headers });
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      const retryable = status === 429 || status >= 500 || ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET'].includes(error.code);
      if (!retryable || attempt === 2) break;
      const retryAfter = Number(error.response?.headers?.['retry-after']);
      await wait(status === 429 ? Math.max(5000, retryAfter * 1000 || 0) : 1500 * (2 ** attempt));
    }
  }
  throw lastError;
}
const normalizeUrl = (raw, base) => {
  try {
    const u = new URL(raw, base);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) u.searchParams.delete(key);
    u.hostname = u.hostname.toLowerCase();
    return u.toString();
  } catch { return null; }
};
const cleanText = (html) => html
  .replace(/<(script|style|nav|header|footer|noscript|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<br\s*\/?\s*>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/[\t ]+/g, ' ').replace(/\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const hash = (text) => crypto.createHash('sha256').update(text || '').digest('hex');
const meaningful = (title, text, url) => /notice|announcement|academic|exam|admission|research|event|workshop|seminar|conference|placement|annual report|faculty|achievement|mou|collaboration|scholarship|recruit|ph\.d|internship|publication|result|tender/i.test(`${title} ${url}`) || (text.length > 500 && /nit raipur|nitrr/i.test(text.slice(0, 3000)));

async function getRobots() {
  try {
    const { data } = await axios.get(new URL('/robots.txt', ROOT).toString(), { timeout: 8000, headers });
    return String(data);
  } catch { return ''; }
}
function robotsAllows(robots, path) {
  const lines = robots.split(/\r?\n/); let applies = false;
  for (const raw of lines) {
    const [key, ...rest] = raw.split(':'); if (!key) continue;
    const value = rest.join(':').trim();
    if (/^user-agent$/i.test(key.trim())) applies = value === '*' || /NarrativeIntelligence/i.test(value);
    if (applies && /^disallow$/i.test(key.trim()) && value && path.startsWith(value)) return false;
  }
  return true;
}
function discoverLinks(html, base) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi)) {
    const url = normalizeUrl(m[1], base); if (!url) continue;
    const title = cleanText(m[2]);
    if (!HOSTS.has(new URL(url).hostname)) continue;
    if (/\.(?:pdf|docx?|xlsx?|pptx?)(?:$|\?)/i.test(url) || meaningful(title, '', url)) out.push({ url, title });
  }
  return out;
}
function parseGdeltDate(value) {
  if (!value) return null;
  const compact = String(value).match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?$/);
  const parsed = compact ? new Date(Date.UTC(Number(compact[1]), Number(compact[2]) - 1, Number(compact[3]), Number(compact[4] || 0), Number(compact[5] || 0), Number(compact[6] || 0))) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
async function extractOfficial() {
  const robots = await getRobots();
  const seeds = [ROOT, ...['acad_downloads.php','ann_report.php','research.php','placement.php','events.php','notice.php'].map(p => new URL(p, ROOT).toString())];
  const visited = new Set(); const queue = seeds.map(url => ({ url, depth: 0, titleHint: '' })); const records = []; const errors = [];
  while (queue.length && visited.size < MAX_PAGES) {
    const { url, depth, titleHint } = queue.shift(); if (visited.has(url)) continue; visited.add(url);
    const parsed = new URL(url); if (!robotsAllows(robots, parsed.pathname)) continue;
    try {
      const response = await axios.get(url, { timeout: 12000, maxContentLength: MAX_BYTES, maxBodyLength: MAX_BYTES, responseType: 'arraybuffer', maxRedirects: 3, headers });
      const finalUrl = response.request?.res?.responseUrl;
      if (finalUrl && !HOSTS.has(new URL(finalUrl).hostname)) throw new Error('Redirected outside the official NIT Raipur domain');
      const type = String(response.headers['content-type'] || '').toLowerCase();
      const isPdf = type.includes('pdf') || /\.pdf(?:$|\?)/i.test(url);
      if (isPdf) {
        records.push({ title: titleHint || decodeURIComponent(url.split('/').pop().split('?')[0]).replace(/[_-]/g, ' '), url, text: '', publishedAt: null, extractionStatus: 'metadata_only', documentType: 'document', metadata: { reason: 'PDF text extraction is not configured in this install' } });
        continue;
      }
      if (!type.includes('html') && !type.includes('text/')) continue;
      const html = Buffer.from(response.data).toString('utf8');
      const title = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') || cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '') || url;
      const text = cleanText(html);
      const dateRaw = html.match(/(?:datePublished|article:published_time|name=["']date["'][^>]*content)\s*[=:]\s*["']([^"']+)/i)?.[1];
      const date = dateRaw && !Number.isNaN(Date.parse(dateRaw)) ? new Date(dateRaw) : null;
      if (meaningful(title, text, url) && text.length >= 100) records.push({ title, url, text, publishedAt: date, extractionStatus: 'success', documentType: /annual report/i.test(title) ? 'report' : /event|workshop|seminar|conference/i.test(title) ? 'event' : 'notice', metadata: {} });
      if (depth < 1) for (const link of discoverLinks(html, url)) if (!visited.has(link.url)) queue.push({ url: link.url, depth: depth + 1, titleHint: link.title });
    } catch (e) { errors.push(`Official source ${url}: ${e.response?.status || e.code || e.message}`); }
    await wait(600);
  }
  return { records, errors, pagesDiscovered: visited.size };
}
async function extractGdelt() {
  const records = []; const errors = [];
  const queries = (process.env.GDELT_QUERIES || '"NIT Raipur";NITRR Raipur').split(';').map(q => q.trim()).filter(Boolean).slice(0, 4);
  for (const [index, query] of queries.entries()) {
    if (index) await wait(5000);
    try {
      const { data } = await gdeltRequest(GDELT_ENDPOINT, { query, mode: 'ArtList', format: 'json', maxrecords: Math.min(Number(process.env.GDELT_MAX_RECORDS) || 50, 250), sort: 'datedesc', timespan: '3months' });
      if (!Array.isArray(data?.articles)) { errors.push(`GDELT returned an invalid ArtList response for ${query}: ${typeof data === 'string' ? data.slice(0, 250) : JSON.stringify(data).slice(0, 250)}`); continue; }
      for (const article of data.articles) {
        const url = normalizeUrl(article.url, ROOT); const title = String(article.title || '').trim();
        if (!url || !title || (!query.includes('"') && !/nit\s*(?:raipur|rr)|national institute of technology\s*,?\s*raipur/i.test(`${title} ${url}`))) continue;
        records.push({ title, url, text: '', publishedAt: null, extractionStatus: 'metadata_only', documentType: 'news_article', metadata: { provenance: 'GDELT', publisher: article.domain || '', language: article.language || '', sourceCountry: article.sourcecountry || '', socialImage: article.socialimage || '', seenDate: parseGdeltDate(article.seendate) } });
      }
    } catch (e) { errors.push(`GDELT ${query}: ${e.response?.status || e.code || e.message}`); }
  }
  return { records: [...new Map(records.map(r => [r.url, r])).values()], errors };
}
export { hash, normalizeUrl, extractOfficial, extractGdelt };
