import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import Parser from 'rss-parser';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleDecoder } from 'google-news-url-decoder';
import Document from '../models/Document.js';
import ProcessingJob from '../models/ProcessingJob.js';

const parser = new Parser({
  customFields: {
    item: ['source']
  }
});
const decoder = new GoogleDecoder();

/**
 * Construct Google News query string with exact-match quotes, topic filters, and historical date parameters
 */
export const buildSearchQuery = (query, timeframe, customStartDate, customEndDate, topicFocus = 'all') => {
  let cleanQuery = (query || '').trim();

  // If query is not already quoted and contains multiple words, wrap entity in double quotes for exact matching
  if (!cleanQuery.startsWith('"') && cleanQuery.includes(' ')) {
    cleanQuery = `"${cleanQuery}"`;
  }

  // Optional topic modifiers for targeted narrative intelligence
  let topicFilter = '';
  switch (topicFocus) {
    case 'placements':
      topicFilter = '(placement OR placements OR package OR packages OR salary OR recruitment OR hire)';
      break;
    case 'campus':
      topicFilter = '(hostel OR hostels OR campus OR infrastructure OR facility OR mess OR accommodation)';
      break;
    case 'research':
      topicFilter = '(research OR ranking OR rankings OR patent OR innovation OR faculty OR laboratory)';
      break;
    case 'admissions':
      topicFilter = '(admission OR admissions OR cutoff OR cutoffs OR counseling OR seat)';
      break;
    case 'all':
    default:
      topicFilter = '';
      break;
  }

  let finalQuery = topicFilter ? `${cleanQuery} ${topicFilter}` : cleanQuery;

  switch (timeframe) {
    case '24h':
      return `${finalQuery} when:1d`;
    case '7d':
      return `${finalQuery} when:7d`;
    case '30d':
      return `${finalQuery} when:30d`;
    case '1y':
      return `${finalQuery} when:1y`;
    case 'custom': {
      let dateFilter = '';
      if (customStartDate && customEndDate) {
        dateFilter = `after:${customStartDate} before:${customEndDate}`;
      } else if (customStartDate) {
        dateFilter = `after:${customStartDate}`;
      } else if (customEndDate) {
        dateFilter = `before:${customEndDate}`;
      }
      return dateFilter ? `${finalQuery} ${dateFilter}` : finalQuery;
    }
    case 'all':
    default:
      return finalQuery;
  }
};

/**
 * Fetch and extract the full article body text from the destination publisher web page
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

    // Strip non-content and layout junk (Notice: we keep forms for ASP.NET pages like PIB)
    $('script, style, noscript, nav, header, footer, svg, iframe, aside, [role="navigation"], .advertisement, .ad, .social-share, .comments, .related-posts').remove();

    const paragraphs = [];
    $('article p, main p, .content p, .story p, .post-content p, #divPrint p, p').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length >= 35 && !paragraphs.includes(text)) {
        paragraphs.push(text);
      }
    });

    if (paragraphs.length >= 1) {
      // Assemble top 15 informative paragraphs (typically ~1,000 to 3,500 characters)
      const fullText = paragraphs.slice(0, 15).join('\n\n');
      if (fullText.length >= 120) {
        return fullText;
      }
    }

    return null;
  } catch (err) {
    // Graceful fallback on network block/paywall/timeout
    return null;
  }
};

/**
 * Fetch, decode, and parse news articles from Google News RSS with full body content
 */
export const fetchGoogleNewsArticles = async ({ 
  query, 
  timeframe = '30d', 
  customStartDate, 
  customEndDate, 
  topicFocus = 'all', 
  limit = 25 
}) => {
  const searchQuery = buildSearchQuery(query, timeframe, customStartDate, customEndDate, topicFocus);
  const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}&hl=en-IN&gl=IN&ceid=IN:en`;

  const feed = await parser.parseURL(feedUrl);
  
  if (!feed || !feed.items || feed.items.length === 0) {
    return [];
  }

  const articles = [];
  const maxItems = Math.min(Number(limit) || 25, feed.items.length);

  // Extract core keywords from entity query to eliminate stray institutions
  const rawEntityWords = query
    .replace(/["']/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !['the', 'and', 'for', 'all', 'from'].includes(w));

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

    // Decode Google News URL to genuine publisher link
    let resolvedUrl = item.link || '';
    if (resolvedUrl.includes('news.google.com')) {
      try {
        const decoded = await decoder.decode(resolvedUrl);
        if (decoded.status && decoded.decoded_url) {
          resolvedUrl = decoded.decoded_url;
        }
      } catch (e) {
        // Fall back to original link
      }
    }

    // Extract full body content from destination website
    let rawText = '';
    const extractedBody = await extractArticleText(resolvedUrl);
    
    if (extractedBody && extractedBody.length >= 150) {
      rawText = extractedBody;
    } else if (item.contentSnippet) {
      rawText = item.contentSnippet.trim();
    } else if (item.content) {
      rawText = item.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    
    if (!rawText || rawText.length < 20) {
      rawText = `${title}. Published by ${sourceName}.`;
    }

    // Relevance Check: Ensure the entity is actually referenced in title or body
    const combinedContent = `${title} ${rawText}`.toLowerCase();
    const isRelevant = rawEntityWords.length === 0 || rawEntityWords.some(w => combinedContent.includes(w));
    if (!isRelevant) {
      continue;
    }

    articles.push({
      title,
      rawText,
      source: sourceName.trim(),
      sourceType: 'News',
      author: sourceName.trim(),
      url: resolvedUrl,
      publicationDate: pubDate,
    });
  }

  return articles;
};

/**
 * Scrape articles and save them directly into MongoDB Document collection
 */
export const scrapeAndIngest = async ({ 
  entityId, 
  query, 
  timeframe = '30d', 
  customStartDate, 
  customEndDate, 
  topicFocus = 'all', 
  limit = 25 
}) => {
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
    topicFocus,
    limit: Number(limit) || 25
  });

  if (articles.length === 0) {
    return {
      success: true,
      totalFound: 0,
      savedCount: 0,
      skippedDuplicates: 0,
      batchId: null,
      message: 'No relevant articles found for the given search query and timeframe.'
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
    message: `Successfully scraped and ingested ${inserted.length} full-text articles into the database!`,
    articles: inserted
  };
};

export default {
  buildSearchQuery,
  extractArticleText,
  fetchGoogleNewsArticles,
  scrapeAndIngest
};
