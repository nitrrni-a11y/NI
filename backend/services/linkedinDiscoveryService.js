import axios from 'axios';
import Document from '../models/Document.js';
import ProcessingJob from '../models/ProcessingJob.js';
import aiService from './aiService.js';
import { computeHash } from './articleExtractor.js';
import { cleanText, normalizeLinkedInUrl, prepareLinkedInCommentDocs } from './linkedinService.js';
import { resolveTranscriptTranslationFields } from './youtubeService.js';

/**
 * Discovers LinkedIn posts for an organisation and its aliases using Apify
 * and classifies them for direct opinions using the Llama-3.1-8B SLM via the AI service.
 */
export const discoverAndClassifyOpinions = async ({
  organisation,
  aliases = [],
  maxResultsPerQuery = 20,
  entityId = null,
}) => {
  const token = process.env.APIFY_API_TOKEN;
  if (!token || !token.trim()) {
    throw new Error('Apify API token is not configured. Please set APIFY_API_TOKEN in backend/.env.');
  }

  if (!organisation || typeof organisation !== 'string' || !organisation.trim()) {
    throw new Error('Organisation name is required for LinkedIn Opinion Discovery.');
  }

  const cleanOrg = organisation.trim();
  const cleanAliases = Array.isArray(aliases)
    ? aliases.map(a => (typeof a === 'string' ? a.trim() : '')).filter(Boolean)
    : (typeof aliases === 'string' ? aliases.split(',').map(s => s.trim()).filter(Boolean) : []);

  // Build unique search queries list (org name + all aliases)
  const queriesSet = new Set([cleanOrg, ...cleanAliases]);
  const queries = Array.from(queriesSet);

  const limitPerQuery = Math.min(Math.max(Number(maxResultsPerQuery) || 20, 5), 50);

  // Synchronous Apify endpoint for coregent/linkedin-posts-search-scraper
  const apifyEndpoint = 'https://api.apify.com/v2/acts/coregent~linkedin-posts-search-scraper/run-sync-get-dataset-items';

  const payload = {
    queries,
    maxResultsPerQuery: limitPerQuery,
    proxyConfiguration: {
      useApifyProxy: true
    }
  };

  let response;
  try {
    response = await axios.post(apifyEndpoint, payload, {
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'Content-Type': 'application/json'
      },
      timeout: 120000 // 120s timeout for search batches
    });
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const responseData = err.response.data;
      const apiMessage = responseData?.error?.message || responseData?.message || JSON.stringify(responseData);

      if (status === 401) {
        throw new Error('Invalid Apify API token. Please verify APIFY_API_TOKEN in backend/.env.');
      } else if (status === 403 || status === 404) {
        throw new Error(`Apify actor error (${status}): ${apiMessage || 'Posts search scraper not found or unauthorized.'}`);
      } else if (status === 429) {
        throw new Error('Apify rate limit exceeded or credit quota exhausted. Please check your Apify account.');
      } else {
        throw new Error(`Apify search scraper failed (${status}): ${apiMessage}`);
      }
    } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      throw new Error('LinkedIn post search timed out after 120 seconds. Try reducing the result limit per query.');
    } else {
      throw new Error(`Network error connecting to Apify: ${err.message}`);
    }
  }

  const rawItems = response.data;
  if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
    return {
      success: true,
      organisation: cleanOrg,
      aliases: cleanAliases,
      totalDiscovered: 0,
      totalUnique: 0,
      counts: {
        relevantOpinion: 0,
        newsAnnouncement: 0,
        irrelevant: 0,
        uncertain: 0
      },
      posts: []
    };
  }

  // --- DEDUPLICATE & NORMALIZE DISCOVERED POSTS ---
  const seenUrls = new Set();
  const uniquePosts = [];

  for (const item of rawItems) {
    const rawPostText = item.text || item.description || item.content || item.commentary || '';
    const cleanedPostText = cleanText(rawPostText);

    if (!cleanedPostText || cleanedPostText.length < 15) {
      continue; // Skip essentially empty posts
    }

    const rawUrl = item.postUrl || item.url || item.link || '';
    let canonicalUrl = '';
    let activityId = '';

    if (rawUrl) {
      try {
        const norm = normalizeLinkedInUrl(rawUrl);
        canonicalUrl = norm.cleanUrl;
        activityId = norm.activityId || '';
      } catch {
        canonicalUrl = rawUrl.trim().replace(/\/+$/, '');
      }
    }

    if (!canonicalUrl) {
      canonicalUrl = `https://www.linkedin.com/posts/discovered_${computeHash(cleanedPostText.slice(0, 80))}`;
    }

    // Deduplicate across queries
    if (seenUrls.has(canonicalUrl)) {
      continue;
    }
    seenUrls.add(canonicalUrl);

    // Extract Author
    let authorName = 'LinkedIn User';
    let authorHeadline = '';
    if (typeof item.authorName === 'string' && item.authorName.trim()) {
      authorName = item.authorName.trim();
    } else if (item.author && typeof item.author === 'object') {
      authorName = item.author.name || item.author.fullName || 'LinkedIn User';
      authorHeadline = item.author.headline || '';
    } else if (typeof item.author === 'string' && item.author.trim()) {
      authorName = item.author.trim();
    }
    if (item.authorHeadline && !authorHeadline) {
      authorHeadline = item.authorHeadline.trim();
    }

    // Date
    const rawDate = item.postedAt || item.timestamp || item.publishedAt || item.date || null;
    const parsedDate = rawDate ? new Date(rawDate) : null;
    const validDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null;

    const postId = item.postId || item.id || activityId || computeHash(`${cleanedPostText}_${authorName}`);
    const likesCount = Number(item.likesCount ?? item.reactionsCount ?? item.likes ?? 0) || 0;
    const commentsCount = Number(item.commentsCount ?? item.numComments ?? 0) || 0;
    const matchedQuery = item.searchQuery || item.query || cleanOrg;

    uniquePosts.push({
      id: String(postId),
      url: canonicalUrl,
      canonicalUrl,
      rawText: cleanedPostText,
      author: authorName,
      authorHeadline,
      publicationDate: validDate,
      likesCount,
      commentsCount,
      matchedQuery,
      // Default initial classification
      classification: 'Uncertain',
      is_directly_about_organisation: false,
      contains_opinion: false,
      opinion_type: 'None',
      reason: 'Awaiting classification.',
      requires_manual_inspection: true,
      alreadyIngested: false,
    });
  }

  // Check which posts already exist in MongoDB Document collection for this entity
  if (entityId && uniquePosts.length > 0) {
    try {
      const candidateUrls = uniquePosts.map(p => p.canonicalUrl);
      const existingDocs = await Document.find({
        entityId,
        canonicalUrl: { $in: candidateUrls }
      }).select('canonicalUrl').lean();

      const existingSet = new Set(existingDocs.map(d => d.canonicalUrl));
      uniquePosts.forEach(p => {
        if (existingSet.has(p.canonicalUrl)) {
          p.alreadyIngested = true;
        }
      });
    } catch (dbErr) {
      console.warn('[LinkedInDiscovery] Error checking existing documents:', dbErr.message);
    }
  }

  // --- CLASSIFY USING EXISTING LLAMA-3.1-8B SLM ---
  if (uniquePosts.length > 0) {
    try {
      const classificationRes = await aiService.classifyLinkedInOpinions(
        cleanOrg,
        cleanAliases,
        uniquePosts
      );

      if (classificationRes && Array.isArray(classificationRes.classified_posts)) {
        const classMap = new Map();
        for (const cp of classificationRes.classified_posts) {
          classMap.set(String(cp.id), cp);
        }

        for (const post of uniquePosts) {
          const matched = classMap.get(post.id);
          if (matched) {
            post.classification = matched.classification || 'Uncertain';
            post.is_directly_about_organisation = Boolean(matched.is_directly_about_organisation);
            post.contains_opinion = Boolean(matched.contains_opinion);
            post.opinion_type = matched.opinion_type || 'None';
            post.reason = matched.reason || '';
            post.requires_manual_inspection = Boolean(matched.requires_manual_inspection);
          }
        }
      }
    } catch (err) {
      console.warn(`[LinkedInDiscovery] Llama-3.1-8B opinion classification failed, falling back to manual inspection:`, err.message);
      for (const p of uniquePosts) {
        p.classification = 'Uncertain';
        p.reason = `AI opinion classification service unavailable (${err.message}). Marked for manual inspection.`;
        p.requires_manual_inspection = true;
      }
    }
  }

  // Compute breakdown counts
  const counts = {
    relevantOpinion: uniquePosts.filter(p => p.classification === 'Relevant Opinion').length,
    newsAnnouncement: uniquePosts.filter(p => p.classification === 'News / Announcement').length,
    irrelevant: uniquePosts.filter(p => p.classification === 'Irrelevant').length,
    uncertain: uniquePosts.filter(p => p.classification === 'Uncertain').length,
    alreadyIngested: uniquePosts.filter(p => p.alreadyIngested).length,
  };

  return {
    success: true,
    organisation: cleanOrg,
    aliases: cleanAliases,
    totalDiscovered: rawItems.length,
    totalUnique: uniquePosts.length,
    counts,
    posts: uniquePosts
  };
};

/**
 * Ingest selected discovered opinion posts (plus any extracted comments and cached translations)
 * as individual documents into MongoDB.
 * Deduplicates by canonicalUrl and creates a ProcessingJob (status: READY).
 */
export const ingestDiscoveredPosts = async ({
  entityId,
  posts = [],
}) => {
  if (!entityId) {
    throw new Error('Entity ID is required for ingestion.');
  }

  if (!Array.isArray(posts) || posts.length === 0) {
    throw new Error('At least one post must be selected for ingestion.');
  }

  const batchId = `BATCH_LI_DISC_${Date.now()}`;
  const candidateUrls = posts.map(p => p.canonicalUrl || p.url).filter(Boolean);

  // Deduplicate posts against existing MongoDB documents for this entity
  const existingDocs = await Document.find({
    entityId,
    canonicalUrl: { $in: candidateUrls }
  }).select('canonicalUrl').lean();

  const existingSet = new Set(existingDocs.map(d => d.canonicalUrl));
  const seenCommentUrls = new Set();
  const docsToInsert = [];
  let duplicatesSkipped = 0;

  for (const post of posts) {
    const canonicalUrl = post.canonicalUrl || post.url;
    if (!canonicalUrl) continue;

    const authorName = (post.author || 'LinkedIn User').trim();
    const title = (post.title || `LinkedIn Opinion by ${authorName}`).slice(0, 150);

    // 1. Ingest Post Document (unless already in DB or explicitly skipped)
    if (post.includePost !== false) {
      if (existingSet.has(canonicalUrl)) {
        duplicatesSkipped++;
      } else {
        existingSet.add(canonicalUrl);

        const postText = (post.rawText || '').trim();
        if (postText) {
          const parsedDate = post.publicationDate ? new Date(post.publicationDate) : null;
          const validDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null;

          const translationFields = resolveTranscriptTranslationFields({
            detectedLanguage: post.detectedLanguage || post.languageCode || 'en',
            translatedText: post.translatedText || '',
            translationStatus: post.translationStatus || 'not_required',
          }, post.detectedLanguage || 'en');

          docsToInsert.push({
            entityId,
            batchId,
            title,
            rawText: postText,
            ...translationFields,
            source: 'LinkedIn',
            sourceType: 'LinkedIn Post',
            author: authorName,
            url: post.url || canonicalUrl,
            canonicalUrl,
            contentHash: computeHash(postText),
            publicationDate: validDate,
            collectedDate: new Date(),
            processingStatus: 'not_processed',
            extractionStatus: 'success',
            metadata: {
              provenance: 'LinkedInOpinionDiscovery',
              platform: 'LinkedIn',
              type: 'post',
              discoveryQuery: post.matchedQuery || '',
              likesCount: Number(post.likesCount) || 0,
              commentsCount: Number(post.commentsCount) || 0,
              classification: post.classification || 'Relevant Opinion',
              opinionType: post.opinion_type || 'None',
              classificationReason: post.reason || '',
              authorHeadline: post.authorHeadline || ''
            }
          });
        }
      }
    }

    // 2. Ingest optional extracted Comments for this post
    let rawCommentsList = [];
    if (Array.isArray(post.selectedComments)) {
      rawCommentsList = post.selectedComments;
    } else if (Array.isArray(post.comments)) {
      rawCommentsList = post.comments;
    } else if (post.comments && post.comments.include !== false && Array.isArray(post.comments.items)) {
      rawCommentsList = post.comments.items;
    }

    if (rawCommentsList.length > 0) {
      const preparedComments = await prepareLinkedInCommentDocs({
        entityId,
        batchId,
        canonicalPostUrl: canonicalUrl,
        postTitle: title,
        comments: rawCommentsList,
        provenance: 'LinkedInDiscoveryComment',
        seenCanonicalUrls: seenCommentUrls,
      });
      docsToInsert.push(...preparedComments.commentDocs);
      duplicatesSkipped += preparedComments.commentsSkipped;
    }
  }

  if (docsToInsert.length === 0) {
    return {
      success: true,
      batchId: null,
      insertedCount: 0,
      postsInserted: 0,
      commentsInserted: 0,
      duplicatesSkipped,
      message: `All ${duplicatesSkipped} selected item(s) already exist in the database for this entity.`,
      documents: []
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
  const postsInserted = insertedDocs.filter(d => d.sourceType === 'LinkedIn Post').length;
  const commentsInserted = insertedDocs.filter(d => d.sourceType === 'LinkedIn Comment').length;

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

  return {
    success: true,
    batchId,
    insertedCount: actualSavedCount,
    postsInserted,
    commentsInserted,
    duplicatesSkipped,
    message: `Successfully ingested ${actualSavedCount} LinkedIn document(s) (${postsInserted} post(s), ${commentsInserted} comment(s); ${duplicatesSkipped} duplicate(s) skipped).`,
    documents: insertedDocs
  };
};

export default {
  discoverAndClassifyOpinions,
  ingestDiscoveredPosts
};

