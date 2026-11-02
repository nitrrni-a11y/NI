import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'node:crypto';

/**
 * Standardize and clean URLs by removing tracking tags and standardizing hostname/path
 */
export const normalizeUrl = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const trimmed = rawUrl.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return '';
    }
    const u = new URL(trimmed);
    if (!['http:', 'https:'].includes(u.protocol)) return '';

    // Remove URL fragment
    u.hash = '';

    // Strip analytics and tracking query parameters
    const trackingRegex = /^(utm_|fbclid|gclid|gclsrc|ref|ref_src|_ga|_gl|ocid|ncid|cmpid|ved|usqp|sr_share)/i;
    for (const key of [...u.searchParams.keys()]) {
      if (trackingRegex.test(key)) {
        u.searchParams.delete(key);
      }
    }

    // Lowercase hostname and strip redundant www.
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');

    // Strip trailing slashes on pathname unless it is root
    let pathname = u.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    u.pathname = pathname;

    // Sort query parameters for consistent URL comparisons
    u.searchParams.sort();

    return u.toString();
  } catch {
    return (rawUrl || '').trim();
  }
};

/**
 * Compute SHA-256 hash of a string
 */
export const computeHash = (text) => {
  return crypto.createHash('sha256').update(text || '').digest('hex');
};

/**
 * Unicode-aware text normalization for fingerprinting and duplicate detection.
 * Preserves letters, marks (Indic matras/vowels), and numbers across all languages (English, Telugu, Hindi, etc.)
 * while stripping punctuation, symbols, and formatting noise.
 */
export const normalizeUnicodeText = (text) => {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Compute a normalized Unicode-aware title fingerprint
 */
export const computeTitleFingerprint = (title) => {
  const cleanTitle = normalizeUnicodeText(title);
  return computeHash(cleanTitle);
};

/**
 * Compute a title and content fingerprint to identify identical or syndicated articles
 * Unicode-aware across English, Telugu, Hindi, and all script languages.
 */
export const computeContentFingerprint = (title, text) => {
  const cleanTitle = normalizeUnicodeText(title);
  const cleanText = normalizeUnicodeText(text).slice(0, 400);

  return computeHash(`${cleanTitle}::${cleanText}`);
};

/**
 * Clean and normalize text strings (remove entities, repeated spaces, etc.)
 */
export const cleanText = (text) => {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Parse HTML content and extract title, body text, author, publisher, and publication date
 */
export const parseHtmlArticle = (html, targetUrl, fallbackMeta = {}) => {
  if (!html || typeof html !== 'string') {
    return { success: false, reason: 'Empty or invalid HTML string' };
  }

  const $ = cheerio.load(html);

  // 1. Extract JSON-LD metadata if present
  let jsonLdTitle = '';
  let jsonLdAuthor = '';
  let jsonLdDate = null;
  let jsonLdPublisher = '';
  let jsonLdBody = '';

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).text();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed)
        ? parsed
        : parsed['@graph'] && Array.isArray(parsed['@graph'])
          ? parsed['@graph']
          : [parsed];

      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const type = String(item['@type'] || '');
        if (/Article|NewsArticle|ReportageNewsArticle|BlogPosting|TechArticle/i.test(type)) {
          if (!jsonLdTitle && item.headline) {
            jsonLdTitle = cleanText(item.headline);
          }
          if (!jsonLdDate && (item.datePublished || item.dateCreated)) {
            const d = new Date(item.datePublished || item.dateCreated);
            if (!isNaN(d.getTime())) jsonLdDate = d;
          }
          if (!jsonLdAuthor && item.author) {
            if (typeof item.author === 'string') {
              jsonLdAuthor = cleanText(item.author);
            } else if (Array.isArray(item.author) && item.author[0]) {
              const a = item.author[0];
              jsonLdAuthor = cleanText(typeof a === 'string' ? a : a.name);
            } else if (item.author.name) {
              jsonLdAuthor = cleanText(item.author.name);
            }
          }
          if (!jsonLdPublisher && item.publisher) {
            jsonLdPublisher = cleanText(typeof item.publisher === 'string' ? item.publisher : item.publisher.name);
          }
          if (!jsonLdBody && item.articleBody && typeof item.articleBody === 'string' && item.articleBody.length >= 120) {
            jsonLdBody = item.articleBody.trim();
          }
        }
      }
    } catch {
      // Ignore JSON parse errors in script tags
    }
  });

  // 2. Canonical URL
  const rawCanonical = $('link[rel="canonical"]').attr('href') ||
    $('meta[property="og:url"]').attr('content') ||
    targetUrl;
  const canonicalUrl = normalizeUrl(rawCanonical) || normalizeUrl(targetUrl);

  // 3. Title Extraction
  let title = jsonLdTitle ||
    cleanText($('meta[property="og:title"]').attr('content')) ||
    cleanText($('meta[name="twitter:title"]').attr('content')) ||
    cleanText($('title').text()) ||
    cleanText($('h1').first().text()) ||
    fallbackMeta.title ||
    '';

  // Strip trailing publisher name suffix from title e.g. "Headline - Reuters" or "Headline | The Hindu"
  if (title.includes(' - ')) {
    const parts = title.split(' - ');
    if (parts.length > 1 && parts[parts.length - 1].length < 35) {
      title = parts.slice(0, -1).join(' - ').trim();
    }
  } else if (title.includes(' | ')) {
    const parts = title.split(' | ');
    if (parts.length > 1 && parts[parts.length - 1].length < 35) {
      title = parts.slice(0, -1).join(' | ').trim();
    }
  }

  // 4. Source / Publisher Extraction
  let sourceName = jsonLdPublisher ||
    cleanText($('meta[property="og:site_name"]').attr('content')) ||
    cleanText($('meta[name="publisher"]').attr('content')) ||
    cleanText($('meta[name="application-name"]').attr('content')) ||
    fallbackMeta.source ||
    fallbackMeta.domain ||
    '';

  if (!sourceName && targetUrl) {
    try {
      sourceName = new URL(targetUrl).hostname.replace(/^www\./, '');
    } catch {
      sourceName = 'News Publisher';
    }
  }

  // 5. Author Extraction (keep author strictly separate from publisher/source, never invent author)
  let rawAuthor = jsonLdAuthor ||
    cleanText($('meta[name="author"]').attr('content')) ||
    cleanText($('meta[property="article:author"]').attr('content')) ||
    cleanText($('meta[name="twitter:creator"]').attr('content')) ||
    cleanText($('[rel="author"]').first().text()) ||
    cleanText($('.author-name, .byline, .author, .byline-name').first().text()) ||
    '';

  // Strip common byline prefixes
  let author = rawAuthor.replace(/^(by|written by|posted by|author:?)\s+/i, '').trim();

  // Validate extracted author:
  // - Must not be a URL
  // - Must be within reasonable length (2 to 60 characters)
  // - Must not be generic agency or publisher/role name
  // - Must not be identical to source/publisher name
  const isGenericOrAgency = /^(admin|administrator|editor|editorial staff|staff|staff reporter|news desk|web desk|reuters|pti|ani|ians|ap|bloomberg|afp|press trust of india|news|unknown)$/i.test(author);
  const isUrl = /^https?:\/\//i.test(author);
  const isMatchingPublisher = sourceName && (author.toLowerCase() === sourceName.toLowerCase() || (sourceName.length > 3 && author.toLowerCase().includes(sourceName.toLowerCase())));

  if (!author || author.length < 2 || author.length > 60 || isGenericOrAgency || isUrl || isMatchingPublisher) {
    author = 'Unknown';
  }

  // 6. Publication Date Extraction (never use GDELT seen date)
  let pubDate = jsonLdDate;
  if (!pubDate) {
    const dateRaw = $('meta[property="article:published_time"]').attr('content') ||
      $('meta[name="pubdate"]').attr('content') ||
      $('meta[name="publishdate"]').attr('content') ||
      $('meta[name="date"]').attr('content') ||
      $('meta[name="DC.date.issued"]').attr('content') ||
      $('time[datetime]').attr('datetime') ||
      $('time').first().text();

    if (dateRaw) {
      const parsed = new Date(dateRaw.trim());
      if (!isNaN(parsed.getTime())) {
        pubDate = parsed;
      }
    }
  }

  // 7. Extract Full Article Body Content
  // First remove non-content, layouts, scripts, ads, social junk
  $('script, style, noscript, nav, header, footer, svg, iframe, aside, form, button, [role="navigation"], [role="banner"], [role="dialog"], .advertisement, .ad, .social-share, .comments, .related-posts, .cookie-banner, .newsletter-signup').remove();

  let paragraphs = [];

  // If jsonLdBody is informative, consider it
  if (jsonLdBody && jsonLdBody.length >= 150) {
    const pList = jsonLdBody.split(/\n+/).map(p => cleanText(p)).filter(p => p.length >= 35);
    if (pList.length >= 2) {
      paragraphs = pList;
    }
  }

  if (paragraphs.length === 0) {
    // Check specific article container first
    const contentContainer = $('article, main, [itemprop="articleBody"], .article-body, .story-body, .article__body, .post-content, .entry-content, #article-body, .content__article-body').first();

    const targetScope = contentContainer.length > 0 ? contentContainer : $('body');

    targetScope.find('p').each((_, el) => {
      const text = cleanText($(el).text());
      if (text.length >= 35 && !paragraphs.includes(text)) {
        // Exclude common boilerplate phrases
        if (!/^(subscribe now|click here to|read more|advertisement|copyright \d{4}|all rights reserved|sign up for)/i.test(text)) {
          paragraphs.push(text);
        }
      }
    });
  }

  // Fallback to div text blocks if p elements are sparse
  if (paragraphs.length === 0) {
    $('article div, .article-body div, .story div').each((_, el) => {
      const text = cleanText($(el).text());
      if (text.length >= 60 && text.length <= 1000 && !paragraphs.includes(text)) {
        paragraphs.push(text);
      }
    });
  }

  if (paragraphs.length === 0) {
    return {
      success: false,
      reason: 'No article body paragraphs could be extracted'
    };
  }

  const fullText = paragraphs.slice(0, 30).join('\n\n');
  if (fullText.length < 120) {
    return {
      success: false,
      reason: `Extracted text length (${fullText.length} chars) is below required minimum of 120 characters`
    };
  }

  const contentHash = computeHash(fullText.slice(0, 500));
  const fingerprint = computeContentFingerprint(title, fullText);
  const titleFingerprint = computeTitleFingerprint(title);

  return {
    success: true,
    title: title || 'Untitled Article',
    rawText: fullText,
    source: sourceName || 'News',
    author: author || 'Unknown',
    publicationDate: pubDate,
    url: normalizeUrl(targetUrl),
    canonicalUrl: canonicalUrl || normalizeUrl(targetUrl),
    contentHash,
    fingerprint,
    titleFingerprint
  };
};

/**
 * Fetch and extract the full article body from a live URL
 */
export const extractArticleContent = async (targetUrl, fallbackMeta = {}) => {
  const normalized = normalizeUrl(targetUrl);
  if (!normalized) {
    return { success: false, reason: 'Invalid or missing target URL' };
  }

  try {
    const res = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000,
      maxRedirects: 5,
      maxContentLength: 5 * 1024 * 1024
    });

    if (!res.data || typeof res.data !== 'string') {
      return { success: false, reason: 'Server returned non-HTML or empty content' };
    }

    const resolvedUrl = res.request?.res?.responseUrl || targetUrl;
    return parseHtmlArticle(res.data, resolvedUrl, fallbackMeta);
  } catch (err) {
    const status = err.response?.status;
    const reason = status
      ? `HTTP ${status}: ${err.response.statusText || 'Error'}`
      : (err.code || err.message || 'Network request failed');
    return { success: false, reason };
  }
};

export default {
  normalizeUrl,
  computeHash,
  normalizeUnicodeText,
  computeTitleFingerprint,
  computeContentFingerprint,
  cleanText,
  parseHtmlArticle,
  extractArticleContent
};
