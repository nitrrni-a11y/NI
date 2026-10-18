import Parser from 'rss-parser';
import Document from '../models/Document.js';
import ProcessingJob from '../models/ProcessingJob.js';

const parser = new Parser({
  customFields: {
    item: ['source']
  }
});

/**
 * Construct Google News query string with flexible historical date parameters
 */
export const buildSearchQuery = (query, timeframe, customStartDate, customEndDate) => {
  const cleanQuery = query.trim();
  
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
 * Fetch and parse news articles from Google News RSS
 */
export const fetchGoogleNewsArticles = async ({ query, timeframe = '30d', customStartDate, customEndDate, limit = 25 }) => {
  const searchQuery = buildSearchQuery(query, timeframe, customStartDate, customEndDate);
  const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}&hl=en-IN&gl=IN&ceid=IN:en`;

  const feed = await parser.parseURL(feedUrl);
  
  if (!feed || !feed.items || feed.items.length === 0) {
    return [];
  }

  const articles = [];
  const maxItems = Math.min(limit, feed.items.length);

  for (let i = 0; i < maxItems; i++) {
    const item = feed.items[i];
    
    // Extract clean source
    let sourceName = 'Unknown News';
    if (item.source) {
      sourceName = typeof item.source === 'object' ? (item.source._ || 'News') : item.source;
    } else if (item.title && item.title.includes(' - ')) {
      const parts = item.title.split(' - ');
      sourceName = parts[parts.length - 1].trim();
    }

    // Clean title (remove trailing source name)
    let title = item.title || 'Untitled Article';
    if (title.endsWith(` - ${sourceName}`)) {
      title = title.substring(0, title.length - (` - ${sourceName}`).length).trim();
    }

    // Parse publication date
    let pubDate = null;
    if (item.pubDate) {
      const parsed = new Date(item.pubDate);
      if (!isNaN(parsed.getTime())) {
        pubDate = parsed;
      }
    }

    // Clean content/snippet
    let rawText = '';
    if (item.contentSnippet) {
      rawText = item.contentSnippet.trim();
    } else if (item.content) {
      rawText = item.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    
    if (!rawText || rawText.length < 20) {
      rawText = `${title}. Published by ${sourceName}.`;
    }

    articles.push({
      title,
      rawText,
      source: sourceName.trim(),
      sourceType: 'News',
      author: sourceName.trim(),
      url: item.link || '',
      publicationDate: pubDate,
    });
  }

  return articles;
};

/**
 * Scrape articles and save them directly into MongoDB Document collection
 */
export const scrapeAndIngest = async ({ entityId, query, timeframe = '30d', customStartDate, customEndDate, limit = 25 }) => {
  if (!entityId) {
    throw new Error('Entity ID is required for scraping');
  }
  if (!query || !query.trim()) {
    throw new Error('Search query is required');
  }

  const articles = await fetchGoogleNewsArticles({
    query,
    timeframe,
    customStartDate,
    customEndDate,
    limit: Number(limit) || 25
  });

  if (articles.length === 0) {
    return {
      success: true,
      totalFound: 0,
      savedCount: 0,
      skippedDuplicates: 0,
      batchId: null,
      message: 'No articles found for the given search query and timeframe.'
    };
  }

  // Check existing URLs to avoid duplicate ingestion
  const articleUrls = articles.map(a => a.url).filter(Boolean);
  const existingDocs = await Document.find({
    entityId,
    url: { $in: articleUrls }
  }).select('url');

  const existingUrlSet = new Set(existingDocs.map(d => d.url));
  const newArticles = articles.filter(a => !existingUrlSet.has(a.url));
  const skippedDuplicates = articles.length - newArticles.length;

  if (newArticles.length === 0) {
    return {
      success: true,
      totalFound: articles.length,
      savedCount: 0,
      skippedDuplicates,
      batchId: null,
      message: `Found ${articles.length} articles, but all were already previously ingested for this entity.`
    };
  }

  const batchId = `BATCH_SCRAPE_${Date.now()}`;

  const docsToInsert = newArticles.map(a => ({
    entityId,
    batchId,
    title: a.title,
    rawText: a.rawText,
    source: a.source,
    sourceType: a.sourceType || 'News',
    author: a.author || a.source,
    url: a.url,
    publicationDate: a.publicationDate,
    collectedDate: new Date(),
    processingStatus: 'not_processed'
  }));

  const inserted = await Document.insertMany(docsToInsert);

  // Create corresponding ProcessingJob so admin can run batch processing right away
  await ProcessingJob.create({
    batchId,
    entityId,
    status: 'READY',
    totalDocuments: inserted.length,
    processedDocuments: 0,
    newNarrativesAdded: 0,
    existingNarrativesUpdated: 0,
    claimsExtracted: 0
  });

  return {
    success: true,
    totalFound: articles.length,
    savedCount: inserted.length,
    skippedDuplicates,
    batchId,
    message: `Successfully scraped and ingested ${inserted.length} new articles into the database!`,
    articles: inserted
  };
};

export default {
  buildSearchQuery,
  fetchGoogleNewsArticles,
  scrapeAndIngest
};
