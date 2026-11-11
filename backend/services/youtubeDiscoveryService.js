import axios from 'axios';
import Document from '../models/Document.js';
import ProcessingJob from '../models/ProcessingJob.js';
import aiService from './aiService.js';
import { computeHash } from './articleExtractor.js';
import { extractVideoId, resolveTranscriptTranslationFields, prepareYouTubeCommentDocs } from './youtubeService.js';

/**
 * Domain-specific review query templates.
 * Replaces {entity} with entity name and aliases.
 */
const QUERY_TEMPLATES_BY_DOMAIN = {
  education: [
    '{entity} review',
    '{entity} honest review',
    '{entity} student experience',
    '{entity} campus life',
    '{entity} placement review',
    '{entity} hostel review',
    'Life at {entity}',
    '{entity} reality check',
    '{entity} worth it'
  ],
  corporate: [
    '{entity} employee review',
    '{entity} work culture',
    '{entity} employee experience',
    'Working at {entity}',
    '{entity} honest review',
    '{entity} pros and cons',
    '{entity} job experience'
  ],
  healthcare: [
    '{entity} patient review',
    '{entity} hospital experience',
    '{entity} doctors review',
    '{entity} treatment feedback',
    '{entity} honest feedback'
  ],
  general: [
    '{entity} review',
    '{entity} honest review',
    '{entity} customer experience',
    '{entity} feedback',
    '{entity} pros and cons',
    '{entity} user experience'
  ]
};

/**
 * Maps an entity's domain or entityType string to a template category key.
 */
export const resolveDomainCategory = (domain = '', entityType = '') => {
  const combined = `${domain} ${entityType}`.toLowerCase();

  if (
    combined.includes('education') ||
    combined.includes('college') ||
    combined.includes('university') ||
    combined.includes('institute') ||
    combined.includes('school') ||
    combined.includes('academic') ||
    combined.includes('higher ed')
  ) {
    return 'education';
  }

  if (
    combined.includes('health') ||
    combined.includes('hospital') ||
    combined.includes('medical') ||
    combined.includes('clinic')
  ) {
    return 'healthcare';
  }

  if (
    combined.includes('corporate') ||
    combined.includes('company') ||
    combined.includes('tech') ||
    combined.includes('business') ||
    combined.includes('enterprise')
  ) {
    return 'corporate';
  }

  return 'general';
};

/**
 * Dynamically generates review-focused YouTube search queries for an organisation.
 * Uses entity name, primary alias, and domain-specific templates.
 */
export const generateSearchQueries = ({
  entityName,
  domain = '',
  entityType = '',
  aliases = []
}) => {
  if (!entityName || typeof entityName !== 'string' || !entityName.trim()) {
    throw new Error('Entity name is required to generate search queries.');
  }

  const cleanName = entityName.trim();
  const cleanAliases = Array.isArray(aliases)
    ? aliases.map(a => (typeof a === 'string' ? a.trim() : '')).filter(Boolean)
    : (typeof aliases === 'string' ? aliases.split(',').map(s => s.trim()).filter(Boolean) : []);

  const category = resolveDomainCategory(domain, entityType);
  const templates = QUERY_TEMPLATES_BY_DOMAIN[category] || QUERY_TEMPLATES_BY_DOMAIN.general;

  const queriesSet = new Set();

  // 1. Primary entity name queries (top 4-5 templates)
  templates.forEach((tmpl) => {
    queriesSet.add(tmpl.replace('{entity}', cleanName));
  });

  // 2. Alias queries (use primary alias for top review templates)
  if (cleanAliases.length > 0) {
    const primaryAlias = cleanAliases[0];
    const topTemplates = templates.slice(0, 4);
    topTemplates.forEach((tmpl) => {
      queriesSet.add(tmpl.replace('{entity}', primaryAlias));
    });

    // If there is a second alias (e.g. short acronym like NITRR)
    if (cleanAliases.length > 1) {
      const secondAlias = cleanAliases[1];
      queriesSet.add(`${secondAlias} review`);
      queriesSet.add(`${secondAlias} honest review`);
    }
  }

  return Array.from(queriesSet);
};

/**
 * Heuristic classifier to identify review-oriented videos without requiring an LLM.
 * Inspects title and description for review and sentiment markers vs purely promotional material.
 */
export const classifyReviewVideoHeuristic = (video) => {
  const title = (video.title || '').toLowerCase();
  const desc = (video.description || '').toLowerCase();
  const combined = `${title} ${desc}`;

  // Promotional or clearly irrelevant patterns
  const irrelevantPatterns = [
    'official inauguration',
    'live stream announcement',
    'recruitment advertisement',
    'vacancy notification',
    'teaser trailer',
    'official trailer',
    'convocation live',
    'webinar recording',
    'syllabus breakdown'
  ];

  for (const pattern of irrelevantPatterns) {
    if (title.includes(pattern)) {
      return {
        classification: 'Uncertain / Other',
        isLikelyReview: false,
        relevanceScore: 0.2,
        relevanceReason: `Matches promotional/announcement pattern: "${pattern}"`
      };
    }
  }

  // Strong review indicators
  const strongKeywords = [
    'review',
    'honest review',
    'reality check',
    'student experience',
    'employee experience',
    'worth it',
    'pros and cons',
    'hostel life',
    'campus life',
    'work culture',
    'truth about',
    'my experience',
    'placement review',
    'fees & placements',
    'fees and placements',
    'feedback',
    'vlog'
  ];

  const matchedKeywords = strongKeywords.filter(kw => title.includes(kw));

  if (matchedKeywords.length > 0) {
    return {
      classification: 'Likely Review',
      isLikelyReview: true,
      relevanceScore: 0.9,
      relevanceReason: `Title contains review keywords: "${matchedKeywords.slice(0, 3).join(', ')}"`
    };
  }

  // Secondary indicators in description
  const descMatched = strongKeywords.filter(kw => desc.includes(kw));
  if (descMatched.length >= 2) {
    return {
      classification: 'Likely Review',
      isLikelyReview: true,
      relevanceScore: 0.75,
      relevanceReason: `Description contains review keywords: "${descMatched.slice(0, 3).join(', ')}"`
    };
  }

  return {
    classification: 'Uncertain / Other',
    isLikelyReview: false,
    relevanceScore: 0.45,
    relevanceReason: 'No direct review or experience keywords found in title.'
  };
};

/**
 * Discovers YouTube videos via Apify actor eiv/youtube-search-scraper,
 * deduplicates across search queries, applies heuristic filtering,
 * and extracts transcripts using the project's existing YouTube extractor.
 */
export const discoverYouTubeVideos = async ({
  queries = [],
  maxResultsPerQuery = 10,
  extractTranscripts = true,
  extractComments = false,
  maxComments = 30,
  entityId = null
}) => {
  const token = process.env.APIFY_API_TOKEN;
  if (!token || !token.trim()) {
    throw new Error('Apify API token is not configured. Please set APIFY_API_TOKEN in backend/.env.');
  }

  if (!Array.isArray(queries) || queries.length === 0) {
    throw new Error('At least one search query is required for YouTube discovery.');
  }

  // Clean and limit queries (maximum 10 queries per discovery run to keep Apify runtime efficient)
  const cleanQueries = queries
    .map(q => (typeof q === 'string' ? q.trim() : ''))
    .filter(Boolean)
    .slice(0, 10);

  if (cleanQueries.length === 0) {
    throw new Error('Valid search queries must be provided.');
  }

  const limitPerQuery = Math.min(Math.max(Number(maxResultsPerQuery) || 10, 2), 30);

  // Synchronous Apify endpoint for eiv/youtube-search-scraper
  const apifyEndpoint = 'https://api.apify.com/v2/acts/eiv~youtube-search-scraper/run-sync-get-dataset-items';

  const payload = {
    searchQueries: cleanQueries,
    maxResults: limitPerQuery
  };

  let response;
  try {
    response = await axios.post(apifyEndpoint, payload, {
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'Content-Type': 'application/json'
      },
      timeout: 180000 // 3 minutes timeout for search batches
    });
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const responseData = err.response.data;
      const apiMessage = responseData?.error?.message || responseData?.message || JSON.stringify(responseData);

      if (status === 401) {
        throw new Error('Invalid Apify API token. Please verify APIFY_API_TOKEN in backend/.env.');
      } else if (status === 403 || status === 404) {
        throw new Error(`Apify actor error (${status}): ${apiMessage || 'YouTube search scraper actor not found or unauthorized.'}`);
      } else if (status === 429) {
        throw new Error('Apify rate limit exceeded or credit quota exhausted. Please check your Apify account.');
      } else {
        throw new Error(`Apify YouTube search scraper failed (${status}): ${apiMessage}`);
      }
    } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      throw new Error('YouTube search timed out after 180 seconds. Try reducing the number of queries or results per query.');
    } else {
      throw new Error(`Network error connecting to Apify: ${err.message}`);
    }
  }

  const rawItems = response.data;
  if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
    return {
      success: true,
      queries: cleanQueries,
      totalDiscovered: 0,
      totalUnique: 0,
      counts: {
        totalResults: 0,
        uniqueVideos: 0,
        likelyReviews: 0,
        uncertainOther: 0,
        transcriptsExtracted: 0,
        transcriptsUnavailable: 0,
        commentsExtracted: 0,
        alreadyIngested: 0
      },
      videos: []
    };
  }

  // --- DEDUPLICATE VIDEOS ACROSS QUERIES BY VIDEO ID / CANONICAL URL ---
  const seenVideoIds = new Set();
  const uniqueVideos = [];

  for (const item of rawItems) {
    const videoId = item.id || extractVideoId(item.url || '');
    if (!videoId || seenVideoIds.has(videoId)) {
      continue;
    }
    seenVideoIds.add(videoId);

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const heuristic = classifyReviewVideoHeuristic(item);

    uniqueVideos.push({
      id: videoId,
      videoId,
      url: canonicalUrl,
      title: item.title || 'Untitled YouTube Video',
      description: item.description || '',
      descriptionSnippet: item.descriptionSnippet || '',
      channelName: item.channelName || 'Unknown Channel',
      channelUrl: item.channelUrl || '',
      viewCount: Number(item.viewCount) || 0,
      likeCount: Number(item.likeCount) || 0,
      commentCount: Number(item.commentCount) || 0,
      publishedAt: item.publishedAt || null,
      durationSeconds: Number(item.durationSeconds) || null,
      durationText: item.durationText || '',
      thumbnailUrl: item.thumbnailUrl || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
      searchQuery: item.searchQuery || item.input || cleanQueries[0],
      classification: heuristic.classification,
      isLikelyReview: heuristic.isLikelyReview,
      relevanceScore: heuristic.relevanceScore,
      relevanceReason: heuristic.relevanceReason,
      // Transcript fields (to be populated)
      hasTranscript: false,
      transcriptSnippet: '',
      transcriptStatus: extractTranscripts ? 'pending' : 'not_requested',
      transcriptError: null,
      transcriptData: null,
      // Comments fields (to be populated optionally or on-demand)
      commentsExtracted: false,
      commentsStatus: extractComments ? 'pending' : 'not_requested',
      commentsError: null,
      commentsData: null,
      alreadyIngested: false
    });
  }

  // Check which videos are already ingested in MongoDB Document collection for this entity
  if (entityId && uniqueVideos.length > 0) {
    try {
      const candidateUrls = uniqueVideos.map(v => v.url);
      const existingDocs = await Document.find({
        entityId,
        canonicalUrl: { $in: candidateUrls }
      }).select('canonicalUrl').lean();

      const existingSet = new Set(existingDocs.map(d => d.canonicalUrl));
      uniqueVideos.forEach(v => {
        if (existingSet.has(v.url)) {
          v.alreadyIngested = true;
        }
      });
    } catch (dbErr) {
      console.warn('[discoverYouTubeVideos] Error checking existing documents:', dbErr.message);
    }
  }

  // --- TRANSCRIPT & OPTIONAL COMMENTS EXTRACTION FOR DISCOVERED VIDEOS ---
  let transcriptsExtractedCount = 0;
  let transcriptsUnavailableCount = 0;
  let commentsExtractedCount = 0;

  if ((extractTranscripts || extractComments) && uniqueVideos.length > 0) {
    const targetMaxComments = Math.max(1, Math.min(Number(maxComments) || 30, 500));
    const BATCH_SIZE = 3;
    for (let i = 0; i < uniqueVideos.length; i += BATCH_SIZE) {
      const chunk = uniqueVideos.slice(i, i + BATCH_SIZE);
      await Promise.all(chunk.map(async (video) => {
        try {
          const result = await aiService.extractYouTubeData(video.url, {
            extractTranscript: Boolean(extractTranscripts),
            extractComments: Boolean(extractComments),
            maxComments: targetMaxComments
          });

          if (extractTranscripts) {
            const tr = result?.transcript;
            const trText = (tr ? (tr.success ? tr.raw_text : '') : result?.raw_text) || '';
            if (trText.trim()) {
              const langCode = tr?.detected_language || result?.detected_language || 'en';
              const langName = tr?.language_name || result?.language_name || 'English';
              const wordCount = tr?.word_count || result?.word_count || trText.trim().split(/\s+/).length;
              const readMins = tr?.estimated_reading_minutes || result?.estimated_reading_minutes || 1;
              video.hasTranscript = true;
              video.transcriptStatus = 'available';
              video.transcriptSnippet = trText.trim().slice(0, 350) + (trText.length > 350 ? '...' : '');
              video.transcriptData = {
                raw_text: trText.trim(),
                detected_language: langCode,
                language_name: langName,
                is_generated: tr?.is_generated ?? result?.is_generated ?? false,
                char_count: tr?.char_count || result?.char_count || trText.length,
                word_count: wordCount,
                estimated_reading_minutes: readMins
              };
              transcriptsExtractedCount++;
            } else {
              video.hasTranscript = false;
              const trErr = tr?.error || 'Transcript not found or empty.';
              if (trErr.toLowerCase().includes('disabled')) {
                video.transcriptStatus = 'disabled';
                video.transcriptError = 'Subtitles/transcripts are disabled by the video owner.';
              } else {
                video.transcriptStatus = 'unavailable';
                video.transcriptError = trErr;
              }
              transcriptsUnavailableCount++;
            }
          }

          if (extractComments) {
            const cRes = result?.comments;
            if (cRes && cRes.success && Array.isArray(cRes.comments) && cRes.comments.length > 0) {
              video.commentsExtracted = true;
              video.commentsStatus = cRes.status || 'success';
              video.commentsData = cRes;
              commentsExtractedCount++;
            } else {
              video.commentsExtracted = false;
              video.commentsStatus = cRes?.status || 'empty';
              video.commentsError = cRes?.error || null;
              video.commentsData = cRes || null;
            }
          }
        } catch (extractErr) {
          const msg = extractErr.message || 'Extraction unavailable';
          if (extractTranscripts) {
            video.hasTranscript = false;
            if (msg.toLowerCase().includes('disabled')) {
              video.transcriptStatus = 'disabled';
              video.transcriptError = 'Subtitles/transcripts are disabled by the video owner.';
            } else {
              video.transcriptStatus = 'unavailable';
              video.transcriptError = msg;
            }
            transcriptsUnavailableCount++;
          }
          if (extractComments) {
            video.commentsExtracted = false;
            video.commentsStatus = 'failed';
            video.commentsError = msg;
          }
        }
      }));
    }
  } else {
    uniqueVideos.forEach(v => {
      v.transcriptStatus = 'not_requested';
      v.commentsStatus = 'not_requested';
    });
  }

  const likelyReviewsCount = uniqueVideos.filter(v => v.isLikelyReview).length;
  const uncertainOtherCount = uniqueVideos.length - likelyReviewsCount;
  const alreadyIngestedCount = uniqueVideos.filter(v => v.alreadyIngested).length;

  return {
    success: true,
    queries: cleanQueries,
    totalDiscovered: rawItems.length,
    totalUnique: uniqueVideos.length,
    counts: {
      totalResults: rawItems.length,
      uniqueVideos: uniqueVideos.length,
      likelyReviews: likelyReviewsCount,
      uncertainOther: uncertainOtherCount,
      transcriptsExtracted: transcriptsExtractedCount,
      transcriptsUnavailable: transcriptsUnavailableCount,
      commentsExtracted: commentsExtractedCount,
      alreadyIngested: alreadyIngestedCount
    },
    videos: uniqueVideos
  };
};

/**
 * Ingest selected discovered YouTube videos (transcripts + optional comments) into MongoDB Document collection.
 * Deduplicates against existing canonical URLs and creates a ProcessingJob for the AI pipeline.
 */
export const ingestDiscoveredVideos = async ({
  entityId,
  videos = []
}) => {
  if (!entityId) {
    throw new Error('Entity ID is required for ingestion.');
  }

  if (!Array.isArray(videos) || videos.length === 0) {
    throw new Error('At least one video must be selected for ingestion.');
  }

  const batchId = `BATCH_YT_DISC_${Date.now()}`;
  const candidateUrls = videos.map(v => v.url || `https://www.youtube.com/watch?v=${v.videoId || v.id}`);

  // Check existing video transcript documents
  const existingDocs = await Document.find({
    entityId,
    canonicalUrl: { $in: candidateUrls }
  }).select('canonicalUrl').lean();

  const existingSet = new Set(existingDocs.map(d => d.canonicalUrl));
  const existingCommentSet = new Set();
  const docsToInsert = [];
  let duplicatesSkipped = 0;

  for (const video of videos) {
    const videoId = video.videoId || video.id;
    const canonicalUrl = video.url || `https://www.youtube.com/watch?v=${videoId}`;

    // 1. Transcript / video document
    if (video.includeTranscript !== false) {
      if (existingSet.has(canonicalUrl)) {
        duplicatesSkipped++;
      } else {
        existingSet.add(canonicalUrl);

        const td = video.transcriptData || {};
        const trPayload = video.transcript || {};
        let textContent = '';
        if (typeof trPayload.rawText === 'string' && trPayload.rawText.trim()) {
          textContent = trPayload.rawText.trim();
        } else if (typeof td.raw_text === 'string' && td.raw_text.trim()) {
          textContent = td.raw_text.trim();
        } else if (typeof video.rawText === 'string' && video.rawText.trim()) {
          textContent = video.rawText.trim();
        } else {
          const parts = [];
          if (video.title) parts.push(`Video Title: ${video.title}`);
          if (video.channelName) parts.push(`Channel: ${video.channelName}`);
          if (video.description) parts.push(`Description:\n${video.description}`);
          textContent = parts.join('\n\n').trim();
        }

        if (!textContent) {
          textContent = video.title || 'YouTube Video Review';
        }

        const hasActualTranscript = Boolean(
          video.hasTranscript ||
          (typeof td.raw_text === 'string' && td.raw_text.trim()) ||
          (typeof trPayload.rawText === 'string' && trPayload.rawText.trim())
        );

        const fallbackLang = trPayload.detectedLanguage || trPayload.languageCode || td.detected_language || td.detectedLanguage || video.detectedLanguage || 'en';
        const translationFields = hasActualTranscript
          ? resolveTranscriptTranslationFields({
              detectedLanguage: trPayload.detectedLanguage || trPayload.languageCode || td.detectedLanguage || td.detected_language || video.detectedLanguage,
              translatedText: trPayload.translatedText || td.translatedText || td.translated_text || video.translatedText,
              translationStatus: trPayload.translationStatus || td.translationStatus || td.translation_status || video.translationStatus,
            }, fallbackLang)
          : { detectedLanguage: 'en', translatedText: '', processingText: '', translationStatus: 'not_required' };

        const contentHash = computeHash(textContent.slice(0, 500));
        const pubDate = video.publishedAt ? new Date(video.publishedAt) : null;
        const validPubDate = pubDate && !isNaN(pubDate.getTime()) ? pubDate : null;

        docsToInsert.push({
          entityId,
          batchId,
          title: (video.title || 'YouTube Video Review').trim(),
          rawText: textContent,
          ...translationFields,
          source: 'YouTube',
          sourceType: 'YouTube Video',
          author: (video.channelName || 'Unknown Channel').trim(),
          url: canonicalUrl,
          canonicalUrl,
          contentHash,
          publicationDate: validPubDate,
          collectedDate: new Date(),
          processingStatus: 'not_processed',
          extractionStatus: hasActualTranscript ? 'success' : 'partial',
          metadata: {
            provenance: 'YouTubeDiscovery',
            videoId,
            channelName: video.channelName || '',
            channelUrl: video.channelUrl || '',
            viewCount: Number(video.viewCount) || 0,
            likeCount: Number(video.likeCount) || 0,
            commentCount: Number(video.commentCount) || 0,
            durationSeconds: video.durationSeconds || null,
            durationText: video.durationText || '',
            thumbnailUrl: video.thumbnailUrl || '',
            hasTranscript: hasActualTranscript,
            searchQuery: video.searchQuery || '',
            classification: video.classification || 'Likely Review',
            relevanceScore: video.relevanceScore || 0.8
          }
        });
      }
    }

    // 2. Optional Comments documents for this video
    let rawCommentItems = [];
    if (Array.isArray(video.comments)) {
      rawCommentItems = video.comments;
    } else if (video.comments && video.comments.include !== false) {
      if (Array.isArray(video.comments.items)) {
        rawCommentItems = video.comments.items;
      } else if (Array.isArray(video.comments.comments)) {
        rawCommentItems = video.comments.comments;
      }
    } else if (video.commentsData && Array.isArray(video.commentsData.comments)) {
      rawCommentItems = video.commentsData.comments;
    }

    if (rawCommentItems.length > 0) {
      // Load existing DB comment URLs for this batch/video inside prepareYouTubeCommentDocs,
      // and use existingCommentSet to prevent duplicates across videos in the same payload.
      const prepared = await prepareYouTubeCommentDocs({
        entityId,
        batchId,
        canonicalVideoUrl: canonicalUrl,
        videoId,
        videoTitle: video.title || 'YouTube Video Review',
        items: rawCommentItems,
        provenance: 'YouTubeDiscoveryComments'
      });
      for (const cDoc of prepared.commentDocs) {
        if (existingCommentSet.has(cDoc.canonicalUrl)) {
          duplicatesSkipped++;
        } else {
          existingCommentSet.add(cDoc.canonicalUrl);
          docsToInsert.push(cDoc);
        }
      }
      duplicatesSkipped += prepared.commentsSkipped;
    }
  }

  if (docsToInsert.length === 0) {
    return {
      success: true,
      batchId: null,
      insertedCount: 0,
      transcriptsInserted: 0,
      commentsInserted: 0,
      duplicatesSkipped,
      message: duplicatesSkipped > 0
        ? `All ${duplicatesSkipped} selected item(s) are already ingested into the database for this entity.`
        : 'No new documents to ingest.'
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
  const transcriptsInserted = insertedDocs.filter(d => d.source === 'YouTube').length;
  const commentsInserted = insertedDocs.filter(d => d.source === 'YouTube Comments').length;

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
    transcriptsInserted,
    commentsInserted,
    duplicatesSkipped,
    message: `Successfully ingested ${actualSavedCount} document(s) (${transcriptsInserted} video transcript(s), ${commentsInserted} comment(s); ${duplicatesSkipped} duplicate(s) skipped).`,
    documents: insertedDocs
  };
};

export default {
  resolveDomainCategory,
  generateSearchQueries,
  classifyReviewVideoHeuristic,
  discoverYouTubeVideos,
  ingestDiscoveredVideos
};

