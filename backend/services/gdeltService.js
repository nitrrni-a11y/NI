import axios from 'axios';
import Document from '../models/Document.js';
import ProcessingJob from '../models/ProcessingJob.js';
import {
  normalizeUrl,
  computeHash,
  computeTitleFingerprint,
  computeContentFingerprint,
  extractArticleContent
} from './articleExtractor.js';

const GDELT_DOC_ENDPOINT = process.env.GDELT_DOC_URL || 'https://api.gdeltproject.org/api/v2/doc/doc';
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NarrativeIntelligence/1.0',
  'Accept': 'application/json,text/plain,*/*'
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Format a Date object or date string into GDELT's YYYYMMDDHHMMSS UTC format
 */
export const formatGdeltDateTime = (dateInput, isEndOfDay = false) => {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;

  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hours = isEndOfDay ? '23' : pad(d.getUTCHours());
  const mins = isEndOfDay ? '59' : pad(d.getUTCMinutes());
  const secs = isEndOfDay ? '59' : pad(d.getUTCSeconds());

  return `${year}${month}${day}${hours}${mins}${secs}`;
};

/**
 * Parse GDELT compact seendate (e.g. 20250210T143000Z or 20250210143000) into a Date
 */
export const parseGdeltSeenDate = (seendateStr) => {
  if (!seendateStr) return null;
  const str = String(seendateStr).trim();
  const m = str.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?/);
  if (m) {
    const year = m[1];
    const month = m[2];
    const day = m[3];
    const hours = m[4] || '00';
    const mins = m[5] || '00';
    const secs = m[6] || '00';
    return new Date(Date.UTC(+year, +month - 1, +day, +hours, +mins, +secs));
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Construct GDELT DOC API search query and parameters
 */
export const buildGdeltParams = ({
  query,
  timeframe = '30d',
  customStartDate,
  customEndDate,
  maxrecords = 75
}) => {
  let cleanQuery = (query || '').trim();

  // If query is not already quoted and contains multiple words, wrap in double quotes for exact matching
  if (!cleanQuery.startsWith('"') && !cleanQuery.includes('"') && cleanQuery.includes(' ')) {
    cleanQuery = `"${cleanQuery}"`;
  }

  const params = {
    query: cleanQuery,
    mode: 'artlist',
    format: 'json',
    sort: 'datedesc',
    maxrecords: Math.min(Math.max(Number(maxrecords) || 75, 10), 250)
  };

  switch (timeframe) {
    case '24h':
      params.timespan = '24h';
      break;
    case '7d':
      params.timespan = '7d';
      break;
    case '30d':
      params.timespan = '30d';
      break;
    case '1y':
      params.timespan = '1y';
      break;
    case 'custom': {
      if (customStartDate && customEndDate) {
        params.STARTDATETIME = formatGdeltDateTime(customStartDate, false);
        params.ENDDATETIME = formatGdeltDateTime(customEndDate, true);
      } else if (customStartDate) {
        params.STARTDATETIME = formatGdeltDateTime(customStartDate, false);
      } else if (customEndDate) {
        params.ENDDATETIME = formatGdeltDateTime(customEndDate, true);
      } else {
        params.timespan = '30d';
      }
      break;
    }
    case 'all':
      params.timespan = '5y';
      break;
    default:
      params.timespan = '30d';
  }

  return params;
};

/**
 * Perform a resilient HTTP request to GDELT DOC API with retries and exponential backoff
 */
export const queryGdeltApi = async (params) => {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await axios.get(GDELT_DOC_ENDPOINT, {
        params,
        timeout: 20000,
        headers: REQUEST_HEADERS
      });

      // GDELT returns JSON or sometimes HTML error messages
      if (response.data && typeof response.data === 'object' && Array.isArray(response.data.articles)) {
        return response.data.articles;
      }

      if (typeof response.data === 'string' && response.data.includes('"articles"')) {
        try {
          const parsed = JSON.parse(response.data);
          if (Array.isArray(parsed.articles)) {
            return parsed.articles;
          }
        } catch {
          // Fall through to error
        }
      }

      // If GDELT returns empty result or no articles
      return [];
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      const retryable = status === 429 || status >= 500 || ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'].includes(err.code);

      if (!retryable || attempt === 2) {
        break;
      }

      const retryAfter = Number(err.response?.headers?.['retry-after']);
      const backoffMs = status === 429
        ? Math.max(5000, (retryAfter || 5) * 1000)
        : 1500 * (2 ** attempt);

      await wait(backoffMs);
    }
  }

  if (lastError) {
    console.warn(`GDELT API warning for query "${params.query}":`, lastError.message);
  }
  return [];
};

/**
 * Discover GDELT articles, handling multiple queries/variants to satisfy the requested target count
 */
export const discoverGdeltArticles = async ({
  query,
  timeframe = '30d',
  customStartDate,
  customEndDate,
  targetCount = 25
}) => {
  const discovered = [];
  const seenUrls = new Set();

  const queryVariants = [];
  const clean = (query || '').trim();
  if (clean) {
    queryVariants.push(clean.includes(' ') && !clean.startsWith('"') ? `"${clean}"` : clean);
    if (clean.includes(' ') && !clean.startsWith('"')) {
      queryVariants.push(clean);
    }
  }

  const maxrecords = Math.min(Math.max(targetCount * 2, 75), 250);

  for (let i = 0; i < queryVariants.length; i++) {
    const variant = queryVariants[i];
    if (i > 0) {
      await wait(2500);
    }

    const params = buildGdeltParams({
      query: variant,
      timeframe,
      customStartDate,
      customEndDate,
      maxrecords
    });

    const articles = await queryGdeltApi(params);

    for (const art of articles) {
      const rawUrl = art.url || art.URL;
      const norm = normalizeUrl(rawUrl);
      if (!norm || seenUrls.has(norm)) continue;

      seenUrls.add(norm);
      discovered.push({
        url: rawUrl,
        normalizedUrl: norm,
        title: (art.title || art.TITLE || '').trim(),
        domain: (art.domain || art.DOMAIN || '').trim(),
        language: (art.language || art.LANGUAGE || '').trim(),
        sourceCountry: (art.sourcecountry || art.SOURCECOUNTRY || '').trim(),
        seenDate: art.seendate || art.SEENDATE || null
      });
    }

    if (discovered.length >= targetCount * 2) {
      break;
    }
  }

  return discovered;
};

/**
 * Calculate boundary dates for GDELT timeframe queries to enforce strict date boundaries
 */
export const calculateGdeltTimeframeBoundaries = (timeframe, customStartDate, customEndDate) => {
  const now = new Date();
  let startDate = null;
  let endDate = customEndDate ? new Date(customEndDate) : now;

  switch (timeframe) {
    case '24h':
      startDate = new Date(now.getTime() - 24 * 3600 * 1000);
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
      break;
    case '1y':
      startDate = new Date(now.getTime() - 365 * 24 * 3600 * 1000);
      break;
    case 'custom':
      startDate = customStartDate ? new Date(customStartDate) : null;
      if (customEndDate) {
        const endD = new Date(customEndDate);
        endD.setUTCHours(23, 59, 59, 999);
        endDate = endD;
      }
      break;
    case 'all':
      startDate = new Date(now.getTime() - 5 * 365 * 24 * 3600 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
      break;
  }

  return { startDate, endDate };
};

/**
 * Preview GDELT news articles with content extraction without saving to MongoDB.
 * Consistently marks successful full-text extractions.
 */
export const previewGdeltArticles = async ({
  query,
  timeframe = '30d',
  customStartDate,
  customEndDate,
  limit = 10,
  entityId
}) => {
  const targetLimit = Math.min(Number(limit) || 10, 50);

  const discovered = await discoverGdeltArticles({
    query,
    timeframe,
    customStartDate,
    customEndDate,
    targetCount: targetLimit
  });

  if (discovered.length === 0) {
    return [];
  }

  const articles = [];
  const batchSize = 4;
  for (let i = 0; i < discovered.length && articles.length < targetLimit; i += batchSize) {
    const chunk = discovered.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      chunk.map((item) =>
        extractArticleContent(item.url, {
          title: item.title,
          domain: item.domain,
          source: item.domain
        })
      )
    );

    for (let j = 0; j < results.length; j++) {
      const res = results[j];
      const orig = chunk[j];

      if (res.status === 'fulfilled' && res.value && res.value.success) {
        articles.push({
          title: res.value.title || orig.title,
          rawText: res.value.rawText,
          source: res.value.source || orig.domain || 'GDELT News',
          sourceType: 'News',
          author: res.value.author || 'Unknown',
          url: res.value.url || orig.url,
          canonicalUrl: res.value.canonicalUrl || orig.normalizedUrl,
          publicationDate: res.value.publicationDate || null,
          hasFullText: true,
          extractionStatus: 'success'
        });

        if (articles.length >= targetLimit) break;
      }
    }
  }

  return articles;
};

/**
 * Duplicate-aware GDELT scraping with pagination.
 * The limit represents the target number of NEW, unique, successfully extracted
 * articles to save. Continues fetching through multiple pages until the target
 * is reached or available results are exhausted.
 */
export const scrapeAndIngestGdelt = async ({
  entityId,
  query,
  timeframe = '30d',
  customStartDate,
  customEndDate,
  limit = 25
}) => {
  if (!entityId) {
    throw new Error('Entity ID is required for GDELT scraping');
  }
  if (!query || !query.trim()) {
    throw new Error('Search query is required');
  }

  const targetLimit = Math.min(Number(limit) || 25, 100);

  // Calculate strict date boundaries for GDELT to prevent pagination from searching outside the requested window
  const { startDate, endDate } = calculateGdeltTimeframeBoundaries(timeframe, customStartDate, customEndDate);
  const startDateTimeStr = startDate ? formatGdeltDateTime(startDate, false) : null;

  // 1. Pre-fetch existing documents for this entity to prevent duplicate ingestion
  // Uses normalized URL, canonical URL, and content fingerprint (never rejects purely on title)
  const existingDocs = await Document.find({ entityId })
    .select('url canonicalUrl contentHash rawText title')
    .lean();

  const dbUrlSet = new Set();
  const dbCanonicalSet = new Set();
  const dbContentHashSet = new Set();
  const dbContentFingerprintSet = new Set();

  for (const doc of existingDocs) {
    if (doc.url) dbUrlSet.add(normalizeUrl(doc.url));
    if (doc.canonicalUrl) dbCanonicalSet.add(normalizeUrl(doc.canonicalUrl));
    if (doc.contentHash) dbContentHashSet.add(doc.contentHash);
    if (doc.rawText) dbContentFingerprintSet.add(computeContentFingerprint(doc.title || '', doc.rawText));
  }

  const runUrlSet = new Set(dbUrlSet);
  const runCanonicalSet = new Set(dbCanonicalSet);
  const runContentHashSet = new Set(dbContentHashSet);
  const runContentFingerprintSet = new Set(dbContentFingerprintSet);

  const rawEntityWords = query
    .replace(/["']/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['the', 'and', 'for', 'all', 'from', 'with', 'about', 'news'].includes(w));

  const clean = (query || '').trim();
  const primaryQuery = clean.includes(' ') && !clean.startsWith('"') ? `"${clean}"` : clean;

  let totalDiscovered = 0;
  let extractedCount = 0;
  let duplicatesSkipped = 0;
  let irrelevantSkipped = 0;
  let extractionFailures = 0;
  const usableArticles = [];

  let page = 0;
  const maxPages = 8;
  let consecutiveEmptyPages = 0;
  let nextEndDateTime = null;

  // 2. Pagination collection loop
  while (usableArticles.length < targetLimit && page < maxPages && consecutiveEmptyPages < 2) {
    page++;

    const maxrecords = Math.min(Math.max((targetLimit - usableArticles.length) * 3, 75), 250);

    const params = buildGdeltParams({
      query: primaryQuery,
      timeframe,
      customStartDate,
      customEndDate,
      maxrecords
    });

    if (page > 1 && nextEndDateTime) {
      delete params.timespan;
      params.ENDDATETIME = nextEndDateTime;
      if (startDateTimeStr) {
        params.STARTDATETIME = startDateTimeStr;
      }
    }

    const rawArticles = await queryGdeltApi(params);

    if (!Array.isArray(rawArticles) || rawArticles.length === 0) {
      consecutiveEmptyPages++;
      if (consecutiveEmptyPages >= 2) break;
      continue;
    }

    let oldestSeenDate = null;
    let pageNewCandidates = 0;
    const pageCandidates = [];

    for (const art of rawArticles) {
      totalDiscovered++;
      const rawUrl = art.url || art.URL;
      const norm = normalizeUrl(rawUrl);
      if (!norm) continue;

      const seenDate = parseGdeltSeenDate(art.seendate || art.SEENDATE);
      if (seenDate && (!oldestSeenDate || seenDate < oldestSeenDate)) {
        oldestSeenDate = seenDate;
      }

      if (runUrlSet.has(norm)) {
        duplicatesSkipped++;
        continue;
      }

      // Pre-reserve URL to prevent processing duplicate URLs within same page
      runUrlSet.add(norm);
      pageNewCandidates++;

      pageCandidates.push({
        url: rawUrl,
        normalizedUrl: norm,
        title: (art.title || art.TITLE || '').trim(),
        domain: (art.domain || art.DOMAIN || '').trim(),
        language: (art.language || art.LANGUAGE || '').trim(),
        sourceCountry: (art.sourcecountry || art.SOURCECOUNTRY || '').trim(),
        seenDate
      });
    }

    if (pageCandidates.length === 0) {
      consecutiveEmptyPages++;
    } else {
      consecutiveEmptyPages = 0;
    }

    // 3. Extract article content in concurrent batches
    const batchSize = 4;
    for (let i = 0; i < pageCandidates.length && usableArticles.length < targetLimit; i += batchSize) {
      const chunk = pageCandidates.slice(i, i + batchSize);

      const extractionResults = await Promise.allSettled(
        chunk.map((cand) =>
          extractArticleContent(cand.url, {
            title: cand.title,
            domain: cand.domain,
            source: cand.domain
          })
        )
      );

      for (let j = 0; j < extractionResults.length; j++) {
        const res = extractionResults[j];
        const cand = chunk[j];

        if (res.status !== 'fulfilled' || !res.value || !res.value.success) {
          extractionFailures++;
          continue;
        }

        const extracted = res.value;
        extractedCount++;

        // Relevance check
        const combined = `${extracted.title} ${extracted.rawText}`.toLowerCase();
        const isRelevant = rawEntityWords.length === 0 || rawEntityWords.some((w) => combined.includes(w));
        if (!isRelevant) {
          irrelevantSkipped++;
          continue;
        }

        // Canonical URL duplicate check
        const normCanonical = extracted.canonicalUrl || cand.normalizedUrl;
        if (runCanonicalSet.has(normCanonical) || runUrlSet.has(normCanonical)) {
          duplicatesSkipped++;
          continue;
        }

        // Content hash duplicate check
        if (extracted.contentHash && runContentHashSet.has(extracted.contentHash)) {
          duplicatesSkipped++;
          continue;
        }

        // Content fingerprint duplicate check (detects identical or syndicated content without falsely rejecting different articles with matching titles)
        if (extracted.fingerprint && runContentFingerprintSet.has(extracted.fingerprint)) {
          duplicatesSkipped++;
          continue;
        }

        // Mark as seen
        runCanonicalSet.add(normCanonical);
        if (extracted.contentHash) runContentHashSet.add(extracted.contentHash);
        if (extracted.fingerprint) runContentFingerprintSet.add(extracted.fingerprint);

        usableArticles.push({
          title: extracted.title || cand.title,
          rawText: extracted.rawText,
          source: extracted.source || cand.domain || 'GDELT News',
          sourceType: 'News',
          author: extracted.author || 'Unknown',
          url: cand.normalizedUrl,
          canonicalUrl: normCanonical,
          contentHash: extracted.contentHash,
          publicationDate: extracted.publicationDate || null, // Never invent or use seendate
          metadata: {
            provenance: 'GDELT',
            domain: cand.domain,
            language: cand.language,
            sourceCountry: cand.sourceCountry
          }
        });

        if (usableArticles.length >= targetLimit) {
          break;
        }
      }
    }

    if (usableArticles.length >= targetLimit) {
      break;
    }

    // Prepare ENDDATETIME for next pagination request, preserving the lower date boundary
    if (oldestSeenDate) {
      const nextEndDate = new Date(oldestSeenDate.getTime() - 1000);
      if (startDate && nextEndDate <= startDate) {
        // Reached or passed the lower boundary of the requested timeframe
        break;
      }
      nextEndDateTime = formatGdeltDateTime(nextEndDate);
    } else {
      break;
    }

    await wait(2000); // Polite rate limit between GDELT pagination queries
  }

  const savedCount = usableArticles.length;
  const isTargetMet = savedCount >= targetLimit;

  // 4. Ingest new distinct documents into MongoDB
  if (savedCount === 0) {
    return {
      success: true,
      source: 'gdelt',
      totalFound: totalDiscovered,
      extractedCount,
      savedCount: 0,
      skippedDuplicates: duplicatesSkipped,
      irrelevantSkipped,
      extractionFailures,
      targetRequested: targetLimit,
      targetReached: false,
      batchId: null,
      message: totalDiscovered > 0
        ? `Found 0 new articles out of requested ${targetLimit} (${duplicatesSkipped} duplicates already in database, ${extractionFailures} extraction failures).`
        : 'No articles found in GDELT for the specified query and timeframe.',
      articles: []
    };
  }

  const batchId = `BATCH_GDELT_${Date.now()}`;
  const docsToInsert = usableArticles.map((a) => ({
    entityId,
    batchId,
    title: a.title,
    rawText: a.rawText,
    source: a.source,
    sourceType: a.sourceType || 'News',
    author: a.author || 'Unknown',
    url: a.url,
    canonicalUrl: a.canonicalUrl,
    contentHash: a.contentHash,
    publicationDate: a.publicationDate,
    collectedDate: new Date(),
    processingStatus: 'not_processed',
    extractionStatus: 'success',
    metadata: a.metadata || {}
  }));

  let insertedDocs = [];
  try {
    insertedDocs = await Document.insertMany(docsToInsert, { ordered: false });
  } catch (err) {
    if (err.insertedDocs && Array.isArray(err.insertedDocs)) {
      insertedDocs = err.insertedDocs;
    } else {
      insertedDocs = await Document.find({ batchId });
    }
  }

  const actualSavedCount = insertedDocs.length;
  const finalTargetMet = actualSavedCount >= targetLimit;

  // 5. Create corresponding ProcessingJob if documents were saved
  if (actualSavedCount > 0) {
    await ProcessingJob.create({
      batchId,
      entityId,
      status: 'READY',
      totalDocuments: actualSavedCount,
      processedDocuments: 0,
      newNarrativesAdded: 0,
      existingNarrativesUpdated: 0,
      claimsExtracted: 0
    });
  }

  let summaryMessage = '';
  if (finalTargetMet) {
    summaryMessage = `Successfully reached target of ${actualSavedCount} new articles via GDELT! (${duplicatesSkipped} duplicates skipped, ${extractionFailures} extraction failures)`;
  } else {
    summaryMessage = `Only ${actualSavedCount} new articles were available out of the requested ${targetLimit} via GDELT (${duplicatesSkipped} duplicates skipped, ${extractionFailures} extraction failures).`;
  }

  return {
    success: true,
    source: 'gdelt',
    totalFound: totalDiscovered,
    extractedCount,
    savedCount: actualSavedCount,
    skippedDuplicates: duplicatesSkipped,
    irrelevantSkipped,
    extractionFailures,
    targetRequested: targetLimit,
    targetReached: finalTargetMet,
    batchId: actualSavedCount > 0 ? batchId : null,
    message: summaryMessage,
    articles: insertedDocs
  };
};

export default {
  formatGdeltDateTime,
  parseGdeltSeenDate,
  calculateGdeltTimeframeBoundaries,
  buildGdeltParams,
  queryGdeltApi,
  discoverGdeltArticles,
  previewGdeltArticles,
  scrapeAndIngestGdelt
};
