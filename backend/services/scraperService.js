import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import Parser from 'rss-parser';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleDecoder } from 'google-news-url-decoder';
import Document from '../models/Document.js';
import ProcessingJob from '../models/ProcessingJob.js';
import {
  normalizeUrl,
  computeHash,
  computeTitleFingerprint,
  computeContentFingerprint,
  extractArticleContent
} from './articleExtractor.js';

const parser = new Parser({
  customFields: {
    item: ['source']
  }
});
const decoder = new GoogleDecoder();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Format a Date object as YYYY-MM-DD
 */
export const formatDateYMD = (dateInput) => {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/**
 * Construct Google News query string with exact-match quotes and historical date parameters
 */
export const buildSearchQuery = (query, timeframe, customStartDate, customEndDate) => {
  let cleanQuery = (query || '').trim();

  // If query is not already quoted and contains multiple words without existing quotes, wrap in double quotes
  if (!cleanQuery.startsWith('"') && !cleanQuery.includes('"') && cleanQuery.includes(' ')) {
    cleanQuery = `"${cleanQuery}"`;
  }

  switch (timeframe) {
    case '24h':
      return `${cleanQuery} when:1d`;
    case '7d':
      return `${cleanQuery} when:7d`;
    case '30d':
      return `${cleanQuery} when:30d`;
    case '1y':
      return `${cleanQuery} when:1y`;
    case 'custom': {
      let dateFilter = '';
      if (customStartDate && customEndDate) {
        dateFilter = `after:${customStartDate} before:${customEndDate}`;
      } else if (customStartDate) {
        dateFilter = `after:${customStartDate}`;
      } else if (customEndDate) {
        dateFilter = `before:${customEndDate}`;
      }
      return dateFilter ? `${cleanQuery} ${dateFilter}` : cleanQuery;
    }
    case 'all':
    default:
      return cleanQuery;
  }
};

/**
 * Fetch and extract article body text from target URL (fallback implementation)
 */
export const extractArticleText = async (targetUrl) => {
  if (!targetUrl || targetUrl.includes('news.google.com')) {
    return null;
  }

  try {
    const res = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 8000,
      maxRedirects: 5
    });

    if (!res.data || typeof res.data !== 'string') {
      return null;
    }

    const $ = cheerio.load(res.data);
    $('script, style, noscript, nav, header, footer, svg, iframe, aside, [role="navigation"], .advertisement, .ad, .social-share, .comments, .related-posts').remove();

    const paragraphs = [];
    $('article p, main p, .content p, .story p, .post-content p, #divPrint p, p').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length >= 35 && !paragraphs.includes(text)) {
        paragraphs.push(text);
      }
    });

    if (paragraphs.length >= 1) {
      const fullText = paragraphs.slice(0, 15).join('\n\n');
      if (fullText.length >= 120) {
        return fullText;
      }
    }

    return null;
  } catch {
    return null;
  }
};

/**
 * Decode a Google News URL to genuine publisher URL
 */
const resolvePublisherUrl = async (rawUrl) => {
  if (!rawUrl) return '';
  if (!rawUrl.includes('news.google.com')) return rawUrl;
  try {
    const decoded = await decoder.decode(rawUrl);
    if (decoded && decoded.status && decoded.decoded_url) {
      return decoded.decoded_url;
    }
  } catch {
    // fallback to original
  }
  return rawUrl;
};

/**
 * Calculate boundary dates for RSS timeframe queries to enforce strict date filtering
 */
export const calculateRssTimeframeBoundaries = (timeframe, customStartDate, customEndDate) => {
  const now = new Date();
  let minDate = null;
  let maxDate = customEndDate ? new Date(customEndDate) : now;

  switch (timeframe) {
    case '24h':
      minDate = new Date(now.getTime() - 24 * 3600 * 1000);
      break;
    case '7d':
      minDate = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      break;
    case '30d':
      minDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
      break;
    case '1y':
      minDate = new Date(now.getTime() - 365 * 24 * 3600 * 1000);
      break;
    case 'custom':
      minDate = customStartDate ? new Date(customStartDate) : null;
      if (customEndDate) {
        const endD = new Date(customEndDate);
        endD.setUTCHours(23, 59, 59, 999);
        maxDate = endD;
      }
      break;
    case 'all':
    default:
      minDate = null;
      break;
  }

  return { minDate, maxDate };
};

/**
 * Fetch news articles preview from Google News RSS.
 * Consistently distinguishes between successfully extracted full-text articles
 * and snippet-only fallback content.
 */
export const fetchGoogleNewsArticles = async ({ 
  query, 
  timeframe = '30d', 
  customStartDate, 
  customEndDate, 
  limit = 25 
}) => {
  const searchQuery = buildSearchQuery(query, timeframe, customStartDate, customEndDate);
  const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}&hl=en-IN&gl=IN&ceid=IN:en`;

  let feed;
  try {
    feed = await parser.parseURL(feedUrl);
  } catch {
    return [];
  }
  
  if (!feed || !feed.items || feed.items.length === 0) {
    return [];
  }

  const articles = [];
  const maxItems = Math.min(Number(limit) || 25, feed.items.length);

  const rawEntityWords = query
    .replace(/["']/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !['the', 'and', 'for', 'all', 'from', 'with'].includes(w));

  for (let i = 0; i < maxItems; i++) {
    const item = feed.items[i];
    let sourceName = 'Unknown News';
    if (item.source) {
      sourceName = typeof item.source === 'object' ? (item.source._ || 'News') : item.source;
    } else if (item.title && item.title.includes(' - ')) {
      const parts = item.title.split(' - ');
      sourceName = parts[parts.length - 1].trim();
    }

    let title = item.title || 'Untitled Article';
    if (title.endsWith(` - ${sourceName}`)) {
      title = title.substring(0, title.length - (` - ${sourceName}`).length).trim();
    }

    let pubDate = null;
    if (item.pubDate) {
      const parsed = new Date(item.pubDate);
      if (!isNaN(parsed.getTime())) pubDate = parsed;
    }

    const resolvedUrl = await resolvePublisherUrl(item.link || '');
    let rawText = '';
    let hasFullText = false;
    let extractionStatus = 'snippet_fallback';
    let author = 'Unknown';

    // Attempt full article extraction consistent with ingestion rules
    const extracted = await extractArticleContent(resolvedUrl, {
      title,
      source: sourceName
    });

    if (extracted && extracted.success && extracted.rawText && extracted.rawText.length >= 120) {
      rawText = extracted.rawText;
      hasFullText = true;
      extractionStatus = 'success';
      author = extracted.author || 'Unknown';
    } else {
      const fallbackBody = await extractArticleText(resolvedUrl);
      if (fallbackBody && fallbackBody.length >= 120) {
        rawText = fallbackBody;
        hasFullText = true;
        extractionStatus = 'success';
        author = 'Unknown';
      } else if (item.contentSnippet && item.contentSnippet.trim().length >= 20) {
        rawText = item.contentSnippet.trim();
        hasFullText = false;
        extractionStatus = 'snippet_fallback';
      } else if (item.content) {
        rawText = item.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        hasFullText = false;
        extractionStatus = 'snippet_fallback';
      } else {
        rawText = `${title}. Published by ${sourceName}.`;
        hasFullText = false;
        extractionStatus = 'snippet_fallback';
      }
    }

    const combinedContent = `${title} ${rawText}`.toLowerCase();
    const isRelevant = rawEntityWords.length === 0 || rawEntityWords.some(w => combinedContent.includes(w));
    if (!isRelevant) continue;

    articles.push({
      title,
      rawText,
      source: sourceName.trim(),
      sourceType: 'News',
      author,
      url: resolvedUrl,
      publicationDate: pubDate,
      hasFullText,
      extractionStatus
    });
  }

  return articles;
};

/**
 * Duplicate-aware Google News RSS scraping with pagination.
 * Continues fetching through multiple pages until the requested target of NEW,
 * unique, successfully extracted articles is reached or available results are exhausted.
 */
export const scrapeAndIngest = async ({ 
  entityId, 
  query, 
  timeframe = '30d', 
  customStartDate, 
  customEndDate, 
  limit = 25 
}) => {
  if (!entityId) {
    throw new Error('Entity ID is required for scraping');
  }
  if (!query || !query.trim()) {
    throw new Error('Search query is required');
  }

  const targetLimit = Math.min(Number(limit) || 25, 100);

  // Determine strict timeframe boundary dates to prevent pagination from searching outside the requested window
  const { minDate, maxDate } = calculateRssTimeframeBoundaries(timeframe, customStartDate, customEndDate);
  const minDateStr = minDate ? formatDateYMD(minDate) : null;

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
    .filter(w => w.length > 2 && !['the', 'and', 'for', 'all', 'from', 'with', 'about', 'news'].includes(w));

  const cleanQuery = query.trim().startsWith('"') ? query.trim() : `"${query.trim()}"`;
  
  let totalDiscovered = 0;
  let extractedCount = 0;
  let duplicatesSkipped = 0;
  let irrelevantSkipped = 0;
  let extractionFailures = 0;
  const usableArticles = [];

  let page = 0;
  const maxPages = 6;
  let consecutiveEmptyPages = 0;
  let beforeDateStr = null;

  // 2. Pagination collection loop
  while (usableArticles.length < targetLimit && page < maxPages && consecutiveEmptyPages < 2) {
    page++;

    let searchQuery = buildSearchQuery(query, timeframe, customStartDate, customEndDate);
    if (page > 1 && beforeDateStr) {
      // Append chronological pagination filter while strictly preserving the lower date boundary
      if (minDateStr) {
        searchQuery = `${cleanQuery} after:${minDateStr} before:${beforeDateStr}`;
      } else {
        searchQuery = `${cleanQuery} before:${beforeDateStr}`;
      }
    }

    const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}&hl=en-IN&gl=IN&ceid=IN:en`;

    let feed;
    try {
      feed = await parser.parseURL(feedUrl);
    } catch {
      consecutiveEmptyPages++;
      break;
    }

    if (!feed || !feed.items || feed.items.length === 0) {
      consecutiveEmptyPages++;
      if (page === 1 && cleanQuery.startsWith('"')) {
        // Try fallback with unquoted query if first quoted search yielded 0 items
        try {
          const fallbackFeed = await parser.parseURL(`https://news.google.com/rss/search?q=${encodeURIComponent(query.trim())}&hl=en-IN&gl=IN&ceid=IN:en`);
          if (fallbackFeed && fallbackFeed.items && fallbackFeed.items.length > 0) {
            feed = fallbackFeed;
            consecutiveEmptyPages = 0;
          }
        } catch {
          // ignore
        }
      }
      if (consecutiveEmptyPages >= 2) break;
      continue;
    }

    let oldestPubDate = null;
    let pageNewItemsCount = 0;

    // Process all candidate items in the feed
    for (let i = 0; i < feed.items.length; i++) {
      const item = feed.items[i];
      totalDiscovered++;

      let itemPubDate = null;
      if (item.pubDate) {
        const parsed = new Date(item.pubDate);
        if (!isNaN(parsed.getTime())) {
          itemPubDate = parsed;
          if (!oldestPubDate || parsed < oldestPubDate) {
            oldestPubDate = parsed;
          }
        }
      }

      // Decode Google News URL
      let resolvedUrl = item.link || '';
      resolvedUrl = await resolvePublisherUrl(resolvedUrl);

      const normUrl = normalizeUrl(resolvedUrl);
      if (!normUrl) {
        extractionFailures++;
        continue;
      }

      // Pre-check duplicate URL in DB or current run
      if (runUrlSet.has(normUrl)) {
        duplicatesSkipped++;
        continue;
      }

      pageNewItemsCount++;

      // Extract article content
      let extracted = await extractArticleContent(resolvedUrl, {
        title: item.title,
        source: item.source ? (typeof item.source === 'object' ? item.source._ : item.source) : ''
      });

      if (!extracted || !extracted.success) {
        // Fallback to extractArticleText if available
        const fallbackBody = await extractArticleText(resolvedUrl);
        if (fallbackBody && fallbackBody.length >= 120) {
          const cleanTitle = item.title || 'Untitled Article';
          extracted = {
            success: true,
            title: cleanTitle,
            rawText: fallbackBody,
            source: typeof item.source === 'object' ? (item.source._ || 'News') : (item.source || 'News'),
            author: 'Unknown',
            publicationDate: itemPubDate,
            url: normUrl,
            canonicalUrl: normUrl,
            contentHash: computeHash(fallbackBody.slice(0, 500)),
            fingerprint: computeContentFingerprint(cleanTitle, fallbackBody)
          };
        } else {
          extractionFailures++;
          continue;
        }
      }

      extractedCount++;

      // Check relevance
      const combined = `${extracted.title} ${extracted.rawText}`.toLowerCase();
      const isRelevant = rawEntityWords.length === 0 || rawEntityWords.some(w => combined.includes(w));
      if (!isRelevant) {
        irrelevantSkipped++;
        continue;
      }

      // Check canonical URL duplicate
      const normCanonical = extracted.canonicalUrl || normUrl;
      if (runCanonicalSet.has(normCanonical) || runUrlSet.has(normCanonical)) {
        duplicatesSkipped++;
        continue;
      }

      // Check content hash duplicate
      if (extracted.contentHash && runContentHashSet.has(extracted.contentHash)) {
        duplicatesSkipped++;
        continue;
      }

      // Check content fingerprint duplicate (detects identical or syndicated content without falsely rejecting different articles with matching titles)
      if (extracted.fingerprint && runContentFingerprintSet.has(extracted.fingerprint)) {
        duplicatesSkipped++;
        continue;
      }

      // Mark seen
      runUrlSet.add(normUrl);
      runCanonicalSet.add(normCanonical);
      if (extracted.contentHash) runContentHashSet.add(extracted.contentHash);
      if (extracted.fingerprint) runContentFingerprintSet.add(extracted.fingerprint);

      usableArticles.push({
        title: extracted.title || item.title,
        rawText: extracted.rawText,
        source: extracted.source || 'News',
        sourceType: 'News',
        author: extracted.author || 'Unknown',
        url: normUrl,
        canonicalUrl: normCanonical,
        contentHash: extracted.contentHash,
        publicationDate: extracted.publicationDate || itemPubDate,
        collectedDate: new Date(),
        processingStatus: 'not_processed',
        extractionStatus: 'success',
        metadata: {
          provenance: 'GoogleNewsRSS'
        }
      });

      if (usableArticles.length >= targetLimit) {
        break;
      }
    }

    if (usableArticles.length >= targetLimit) {
      break;
    }

    if (pageNewItemsCount === 0) {
      consecutiveEmptyPages++;
    } else {
      consecutiveEmptyPages = 0;
    }

    // Prepare date filter for next pagination page, respecting the lower date boundary
    if (oldestPubDate) {
      const nextDate = new Date(oldestPubDate.getTime() - 24 * 3600 * 1000);
      if (minDate && nextDate <= minDate) {
        // Reached or passed the lower boundary of the requested timeframe
        break;
      }
      beforeDateStr = formatDateYMD(nextDate);
      if (minDateStr && beforeDateStr < minDateStr) {
        break;
      }
    } else {
      break;
    }

    await wait(1000); // Polite rate limit between RSS pagination queries
  }

  const savedCount = usableArticles.length;
  const targetReached = savedCount >= targetLimit;

  if (savedCount === 0) {
    return {
      success: true,
      source: 'rss',
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
        : 'No relevant articles found for the given search query and timeframe.',
      articles: []
    };
  }

  const batchId = `BATCH_SCRAPE_${Date.now()}`;
  const docsToInsert = usableArticles.map(a => ({
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
  const isTargetMet = actualSavedCount >= targetLimit;

  // Create corresponding ProcessingJob so admin can run batch processing right away
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
  if (isTargetMet) {
    summaryMessage = `Successfully reached target of ${actualSavedCount} new articles via Google News RSS! (${duplicatesSkipped} duplicates skipped, ${extractionFailures} extraction failures)`;
  } else {
    summaryMessage = `Only ${actualSavedCount} new articles were available out of the requested ${targetLimit} via Google News RSS (${duplicatesSkipped} duplicates skipped, ${extractionFailures} extraction failures).`;
  }

  return {
    success: true,
    source: 'rss',
    totalFound: totalDiscovered,
    extractedCount,
    savedCount: actualSavedCount,
    skippedDuplicates: duplicatesSkipped,
    irrelevantSkipped,
    extractionFailures,
    targetRequested: targetLimit,
    targetReached: isTargetMet,
    batchId,
    message: summaryMessage,
    articles: insertedDocs
  };
};

export default {
  buildSearchQuery,
  calculateRssTimeframeBoundaries,
  extractArticleText,
  fetchGoogleNewsArticles,
  scrapeAndIngest
};
