import axios from 'axios';
import crypto from 'node:crypto';
import Document from '../models/Document.js';
import ProcessingJob from '../models/ProcessingJob.js';
import { computeHash } from './articleExtractor.js';

// Supported LinkedIn Post URL regex pattern
const LINKEDIN_POST_REGEX = /^https?:\/\/(?:[a-zA-Z0-9-]+\.)?linkedin\.com\/(?:posts\/[a-zA-Z0-9_-]+|feed\/update\/urn:li:(?:activity|share|ugcPost):[0-9]+|pulse\/[a-zA-Z0-9_-]+|newsletters\/[a-zA-Z0-9_-]+)/i;

/**
 * Validate and clean a LinkedIn Post URL.
 * Strips tracking parameters and extracts stable activity/share ID if present.
 */
export const normalizeLinkedInUrl = (inputUrl) => {
  if (!inputUrl || typeof inputUrl !== 'string') {
    throw new Error('LinkedIn post URL is required.');
  }

  const trimmed = inputUrl.trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(trimmed);
  } catch (err) {
    throw new Error('Invalid URL format. Please provide a valid LinkedIn URL.');
  }

  // Must belong to linkedin.com domain
  if (!parsedUrl.hostname.includes('linkedin.com')) {
    throw new Error('Invalid domain. URL must be from linkedin.com.');
  }

  // Basic check for post/feed/pulse path
  const pathname = parsedUrl.pathname;
  if (!pathname || pathname === '/' || (!pathname.includes('/posts/') && !pathname.includes('/feed/update/') && !pathname.includes('/pulse/'))) {
    throw new Error('Please provide a direct LinkedIn post URL (e.g., https://www.linkedin.com/posts/... or https://www.linkedin.com/feed/update/urn:li:activity:...).');
  }

  // Strip tracking parameters
  const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'rcm', 'trackingId', 'trk', 'midToken', 'midSig', 'lipi'];
  trackingParams.forEach(param => parsedUrl.searchParams.delete(param));

  // Extract stable activity/share ID if present
  let activityId = null;
  const activityMatch = pathname.match(/(?:activity|share|ugcPost)[:|-]([0-9]{16,22})/i);
  if (activityMatch && activityMatch[1]) {
    activityId = activityMatch[1];
  }

  const cleanUrl = parsedUrl.toString().replace(/\/+$/, '');

  return {
    cleanUrl,
    activityId
  };
};

/**
 * Clean raw text: remove HTML tags, decode entities, and normalize whitespace
 */
export const cleanText = (text) => {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&nbsp;/g, ' ');

  // Normalize horizontal spaces
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  // Collapse excessive consecutive blank lines
  cleaned = cleaned.replace(/\n\s*\n\s*\n+/g, '\n\n');

  return cleaned.trim();
};

/**
 * Identify if a comment is noise (empty, URLs only, generic engagement fluff, etc.)
 * Preserves short but meaningful opinions.
 */
export const filterCommentNoise = (rawText, seenHashes = new Set()) => {
  const cleaned = cleanText(rawText);

  // 1. Empty or whitespace only
  if (!cleaned || cleaned.length === 0) {
    return { keep: false, reason: 'empty', cleanedText: '' };
  }

  // 2. Only URL(s) without meaningful text
  const textWithoutUrls = cleaned.replace(/https?:\/\/\S+/gi, '').trim();
  if (textWithoutUrls.length === 0 || /^[^a-zA-Z0-9]+$/.test(textWithoutUrls)) {
    return { keep: false, reason: 'urls_only', cleanedText: cleaned };
  }

  // 3. Generic engagement fluff & spam tokens (e.g., #CFBR, interested, congratulations)
  // If the comment is solely or predominantly engagement fluff with no substantive opinion:
  const lower = cleaned.toLowerCase().trim();
  
  // Exact or near-exact fluff matches
  const isPureFluffPattern = /^(#?cfbr|commenting\s+for\s+better\s+reach|cfbr\s*!+|reach|for\s+reach|bump|interested|i['’]?\s*a?m\s+interested|pls\s+share|please\s+share|following|follow|congrats!?|congratulations!?|kudos!?|agree|agreed|well\s+said!?|great\s+share!?|thanks\s+for\s+sharing!?|insightful!?)$/i;
  
  if (isPureFluffPattern.test(lower)) {
    return { keep: false, reason: 'engagement_fluff', cleanedText: cleaned };
  }

  // Repeated promo / contact spam (e.g., "DM me on whatsapp +91...", "earn $500 daily")
  if (/(?:whatsapp|telegram)\s*(?::|\+?[0-9]{8,})|earn\s+\$[0-9]+|crypto\s+investment/i.test(lower)) {
    return { keep: false, reason: 'promotional_spam', cleanedText: cleaned };
  }

  // 4. Duplicate comment detection within batch
  const hash = computeHash(lower);
  if (seenHashes.has(hash)) {
    return { keep: false, reason: 'duplicate', cleanedText: cleaned };
  }
  seenHashes.add(hash);

  return { keep: true, cleanedText: cleaned };
};

/**
 * Scrape LinkedIn post and comments via Apify actor data_minds~linkedin-post-scraper
 */
export const scrapeLinkedInPost = async ({ postUrl, numComments = 100 }) => {
  const token = process.env.APIFY_API_TOKEN;
  if (!token || !token.trim()) {
    throw new Error('Apify API token is not configured. Please set APIFY_API_TOKEN in backend/.env to use the LinkedIn Scraper.');
  }

  const { cleanUrl, activityId } = normalizeLinkedInUrl(postUrl);
  const targetCommentCount = Math.min(Math.max(Number(numComments) || 100, 1), 100);

  // Synchronous Apify run endpoint returning dataset items directly
  const apifyEndpoint = 'https://api.apify.com/v2/acts/data_minds~linkedin-post-scraper/run-sync-get-dataset-items';

  const payload = {
    urls: [cleanUrl],
    deepScrape: true,
    numComments: targetCommentCount
  };

  let response;
  try {
    response = await axios.post(apifyEndpoint, payload, {
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'Content-Type': 'application/json'
      },
      timeout: 90000 // 90 seconds timeout for deep scrape
    });
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const responseData = err.response.data;
      const apiMessage = responseData?.error?.message || responseData?.message || JSON.stringify(responseData);

      if (status === 401) {
        throw new Error('Invalid Apify API token. Please verify APIFY_API_TOKEN in backend/.env.');
      } else if (status === 403 || status === 404) {
        throw new Error(`Apify actor error (${status}): ${apiMessage || 'Scraper actor not found or unauthorized.'}`);
      } else if (status === 429) {
        throw new Error('Apify rate limit exceeded or credit quota exhausted. Please check your Apify account.');
      } else {
        throw new Error(`Apify Scraper failed (${status}): ${apiMessage}`);
      }
    } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      throw new Error('Scraping request timed out after 90 seconds. The post may be very large or LinkedIn rate limited the scraper. Please try again.');
    } else {
      throw new Error(`Network error connecting to Apify: ${err.message}`);
    }
  }

  const items = response.data;
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('No data returned from LinkedIn Scraper. The post may be private, deleted, or inaccessible to public scrapers.');
  }

  // --- PARSE POST & COMMENTS STRUCTURE ---
  // The Apify actor may return:
  // 1. A single item containing post details and a nested comments array
  // 2. An array where the first item is the post and subsequent items are comments
  const mainItem = items[0] || {};

  // Extract Post Info
  const rawPostText = mainItem.text || mainItem.content || mainItem.postText || mainItem.commentary || mainItem.body || '';
  const cleanedPostText = cleanText(rawPostText);

  // Author details
  let authorName = 'LinkedIn User';
  let authorHeadline = '';
  if (typeof mainItem.author === 'string' && mainItem.author.trim()) {
    authorName = mainItem.author.trim();
  } else if (mainItem.author && typeof mainItem.author === 'object') {
    authorName = mainItem.author.name || mainItem.author.fullName || mainItem.author.username || 'LinkedIn User';
    authorHeadline = mainItem.author.headline || mainItem.author.occupation || '';
  } else if (mainItem.authorName) {
    authorName = mainItem.authorName;
  }

  // Post Publication Date
  const rawPostDate = mainItem.postedAt || mainItem.publishedAt || mainItem.postedDate || mainItem.date || mainItem.createdAt || null;
  const parsedPostDate = rawPostDate ? new Date(rawPostDate) : null;
  const validPostDate = parsedPostDate && !isNaN(parsedPostDate.getTime()) ? parsedPostDate : null;

  // Post Metrics
  const likesCount = Number(mainItem.likesCount ?? mainItem.numLikes ?? mainItem.numReactions ?? mainItem.likes ?? 0) || 0;
  const totalCommentsReported = Number(mainItem.commentsCount ?? mainItem.numComments ?? mainItem.commentsNum ?? 0) || 0;
  const repostsCount = Number(mainItem.repostsCount ?? mainItem.numReposts ?? mainItem.shares ?? 0) || 0;

  // Extract raw comments list from nested fields or flat items
  let rawComments = [];
  if (Array.isArray(mainItem.comments) && mainItem.comments.length > 0) {
    rawComments = mainItem.comments;
  } else if (Array.isArray(mainItem.commentsData) && mainItem.commentsData.length > 0) {
    rawComments = mainItem.commentsData;
  } else if (Array.isArray(mainItem.postComments) && mainItem.postComments.length > 0) {
    rawComments = mainItem.postComments;
  } else if (items.length > 1) {
    // Top-level items might be comments
    rawComments = items.slice(1);
  }

  // Flatten nested reply threads if present
  const allExtractedComments = [];
  const processCommentNode = (node, parentCommentId = null, parentAuthor = null) => {
    if (!node) return;
    const commentId = node.id || node.commentId || node.urn || node.cid || null;
    let commenterName = 'LinkedIn User';
    let commenterHeadline = '';
    if (typeof node.author === 'string' && node.author.trim()) {
      commenterName = node.author.trim();
    } else if (node.author && typeof node.author === 'object') {
      commenterName = node.author.name || node.author.fullName || node.author.username || 'LinkedIn User';
      commenterHeadline = node.author.headline || '';
    } else if (node.authorName || node.commenter) {
      commenterName = node.authorName || node.commenter;
    }

    const commentTextRaw = node.text || node.comment || node.commentText || node.content || node.commentBody || '';
    const rawDate = node.date || node.postedAt || node.publishedAt || node.createdAt || node.time || null;
    const parsedDate = rawDate ? new Date(rawDate) : null;
    const validDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null;
    const nodeLikes = Number(node.likesCount ?? node.numLikes ?? node.likes ?? 0) || 0;

    allExtractedComments.push({
      id: commentId,
      rawText: commentTextRaw,
      author: commenterName,
      authorHeadline: commenterHeadline,
      publicationDate: validDate,
      likesCount: nodeLikes,
      isReply: Boolean(parentCommentId),
      parentCommentId,
      parentAuthor
    });

    // Check for nested replies
    const replies = node.replies || node.childComments || node.responses;
    if (Array.isArray(replies) && replies.length > 0) {
      for (const reply of replies) {
        processCommentNode(reply, commentId, commenterName);
      }
    }
  };

  for (const c of rawComments) {
    processCommentNode(c);
  }

  // --- FILTER COMMENTS ---
  const seenHashes = new Set();
  const retainedComments = [];
  const filteredBreakdown = {
    empty: 0,
    urls_only: 0,
    engagement_fluff: 0,
    promotional_spam: 0,
    duplicate: 0
  };

  for (const c of allExtractedComments) {
    const filterRes = filterCommentNoise(c.rawText, seenHashes);
    if (filterRes.keep) {
      retainedComments.push({
        ...c,
        rawText: filterRes.cleanedText
      });
    } else {
      if (filteredBreakdown[filterRes.reason] !== undefined) {
        filteredBreakdown[filterRes.reason]++;
      }
    }
  }

  const totalRetrieved = allExtractedComments.length;
  const totalRetained = retainedComments.length;
  const totalFiltered = totalRetrieved - totalRetained;

  // Determine if comments were truncated or limited by LinkedIn
  let isTruncated = false;
  let truncationNotice = '';

  if (totalCommentsReported > totalRetrieved) {
    isTruncated = true;
    truncationNotice = `The post has ${totalCommentsReported} total comments on LinkedIn, but ${totalRetrieved} could be retrieved. LinkedIn restricts logged-out scraping of deeper comment threads.`;
  } else if (totalRetrieved >= targetCommentCount) {
    isTruncated = true;
    truncationNotice = `Reached the requested extraction limit of ${targetCommentCount} comments. Additional comments may exist on LinkedIn.`;
  } else if (totalRetrieved === 0 && totalCommentsReported > 0) {
    isTruncated = true;
    truncationNotice = `Comments could not be accessed. LinkedIn logged-out view may require authentication for this post's comments.`;
  }

  const postTitle = (mainItem.title || `LinkedIn Post by ${authorName}`).slice(0, 150);

  return {
    success: true,
    post: {
      title: postTitle,
      rawText: cleanedPostText,
      author: authorName,
      authorHeadline,
      publicationDate: validPostDate,
      url: cleanUrl,
      canonicalUrl: cleanUrl,
      activityId,
      likesCount,
      commentsCount: totalCommentsReported,
      repostsCount
    },
    comments: retainedComments,
    metrics: {
      totalRetrieved,
      totalRetained,
      filteredCount: totalFiltered,
      filteredBreakdown,
      commentsReportedOnLinkedIn: totalCommentsReported,
      isTruncated,
      truncationNotice
    }
  };
};

/**
 * Prepare deduplicated LinkedIn Comment Document records for a parent LinkedIn post.
 * Shared across single-URL LinkedIn ingestion and LinkedIn Opinion Discovery ingestion.
 */
export const prepareLinkedInCommentDocs = async ({
  entityId,
  batchId,
  canonicalPostUrl,
  postTitle = 'LinkedIn Post',
  comments = [],
  provenance = 'LinkedInComment',
  seenCanonicalUrls = null,
}) => {
  const validComments = (Array.isArray(comments) ? comments : []).filter((c) => {
    if (!c || c.selected === false) return false;
    const text = (c.rawText || c.text || '').trim();
    return text.length > 0;
  });

  if (validComments.length === 0) {
    return { commentDocs: [], commentsSkipped: 0 };
  }

  const getCommentKey = (c) => {
    const commentText = (c.rawText || c.text || '').trim();
    const author = (c.author || 'LinkedIn User').trim();
    return c.id || c.commentId || computeHash(`${commentText}_${author}`);
  };

  const candidateUrls = validComments.map(
    (c) => `${canonicalPostUrl}#comment_${getCommentKey(c)}`
  );

  const existingCommentDocs = await Document.find({
    entityId,
    canonicalUrl: { $in: candidateUrls },
  }).select('canonicalUrl').lean();

  const existingCanonicalSet = new Set(existingCommentDocs.map((d) => d.canonicalUrl));
  const commentDocs = [];
  let commentsSkipped = 0;

  for (const c of validComments) {
    const commentText = (c.rawText || c.text || '').trim();
    const uniqueCommentKey = getCommentKey(c);
    const commentCanonicalUrl = `${canonicalPostUrl}#comment_${uniqueCommentKey}`;

    if (existingCanonicalSet.has(commentCanonicalUrl) || seenCanonicalUrls?.has(commentCanonicalUrl)) {
      commentsSkipped++;
      continue;
    }

    existingCanonicalSet.add(commentCanonicalUrl);
    seenCanonicalUrls?.add(commentCanonicalUrl);

    const rawDate = c.publicationDate || c.publishedAt || null;
    const parsedDate = rawDate ? new Date(rawDate) : null;
    const validDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null;

    const commenterName = (c.author || 'LinkedIn User').trim();
    const commentTitle = `Comment by ${commenterName} on "${(postTitle || 'LinkedIn Post').slice(0, 40)}"`.slice(0, 150);

    commentDocs.push({
      entityId,
      batchId,
      title: commentTitle,
      rawText: commentText,
      source: 'LinkedIn',
      sourceType: 'LinkedIn Comment',
      author: commenterName,
      url: canonicalPostUrl,
      canonicalUrl: commentCanonicalUrl,
      contentHash: computeHash(commentText),
      publicationDate: validDate,
      collectedDate: new Date(),
      processingStatus: 'not_processed',
      extractionStatus: 'success',
      metadata: {
        provenance,
        platform: 'LinkedIn',
        type: 'comment',
        parentPostUrl: canonicalPostUrl,
        parentPostTitle: postTitle || '',
        commentId: c.id || c.commentId || '',
        likesCount: Number(c.likesCount) || 0,
        isReply: Boolean(c.isReply),
        parentCommentId: c.parentCommentId || null,
        parentAuthor: c.parentAuthor || null,
        authorHeadline: c.authorHeadline || '',
      },
    });
  }

  return { commentDocs, commentsSkipped };
};

/**
 * Ingest cleaned LinkedIn post and comments into MongoDB Document collection.
 * Creates one document for the post, and one document for each cleaned comment.
 * Deduplicates based on canonical URL and creates a ProcessingJob (status: READY).
 */
export const ingestLinkedInData = async ({
  entityId,
  post,
  comments = []
}) => {
  if (!entityId) {
    throw new Error('Entity ID is required for ingestion');
  }
  if (!post || !post.rawText || !post.rawText.trim()) {
    throw new Error('Valid LinkedIn post data is required for ingestion');
  }

  const batchId = `BATCH_LI_${Date.now()}`;
  const docsToInsert = [];
  const canonicalPostUrl = post.canonicalUrl || post.url;

  // 1. Deduplicate & prepare Post Document
  let postInserted = false;
  let postSkipped = false;

  const existingPost = await Document.findOne({
    entityId,
    canonicalUrl: canonicalPostUrl,
    source: 'LinkedIn'
  }).lean();

  if (existingPost) {
    postSkipped = true;
  } else {
    docsToInsert.push({
      entityId,
      batchId,
      title: (post.title || `LinkedIn Post by ${post.author || 'User'}`).trim(),
      rawText: post.rawText.trim(),
      source: 'LinkedIn',
      sourceType: 'LinkedIn Post',
      author: (post.author || 'LinkedIn User').trim(),
      url: canonicalPostUrl,
      canonicalUrl: canonicalPostUrl,
      contentHash: computeHash(post.rawText.trim().slice(0, 500)),
      publicationDate: post.publicationDate ? new Date(post.publicationDate) : null,
      collectedDate: new Date(),
      processingStatus: 'not_processed',
      extractionStatus: 'success',
      metadata: {
        provenance: 'LinkedInPost',
        platform: 'LinkedIn',
        type: 'post',
        activityId: post.activityId || '',
        likesCount: Number(post.likesCount) || 0,
        commentsCount: Number(post.commentsCount) || 0,
        repostsCount: Number(post.repostsCount) || 0,
        authorHeadline: post.authorHeadline || ''
      }
    });
    postInserted = true;
  }

  // 2. Deduplicate & prepare Comment Documents
  let commentsSkippedCount = 0;

  if (Array.isArray(comments) && comments.length > 0) {
    const prepared = await prepareLinkedInCommentDocs({
      entityId,
      batchId,
      canonicalPostUrl,
      postTitle: post.title || 'LinkedIn Post',
      comments,
      provenance: 'LinkedInComment',
    });
    docsToInsert.push(...prepared.commentDocs);
    commentsSkippedCount = prepared.commentsSkipped;
  }

  // 3. Save to MongoDB
  if (docsToInsert.length === 0) {
    return {
      success: true,
      batchId: null,
      insertedCount: 0,
      postInserted: false,
      commentsInserted: 0,
      postSkipped,
      commentsSkipped: commentsSkippedCount,
      message: 'All extracted content (post and comments) already exist in the database for this entity.'
    };
  }

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

  // 4. Create ProcessingJob (status: READY) so it integrates with NI AI pipeline
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

  const actualPostSaved = insertedDocs.some(d => d.sourceType === 'LinkedIn Post');
  const actualCommentsSaved = insertedDocs.filter(d => d.sourceType === 'LinkedIn Comment').length;

  return {
    success: true,
    batchId,
    insertedCount: actualSavedCount,
    postInserted: actualPostSaved,
    commentsInserted: actualCommentsSaved,
    postSkipped,
    commentsSkipped: commentsSkippedCount,
    message: `Successfully ingested ${actualSavedCount} LinkedIn document(s) (${actualPostSaved ? '1 post' : '0 posts'}, ${actualCommentsSaved} comments; ${commentsSkippedCount + (postSkipped ? 1 : 0)} duplicates skipped).`,
    documents: insertedDocs
  };
};

export default {
  normalizeLinkedInUrl,
  cleanText,
  filterCommentNoise,
  scrapeLinkedInPost,
  ingestLinkedInData
};

