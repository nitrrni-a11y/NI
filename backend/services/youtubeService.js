import crypto from 'node:crypto';
import Document from '../models/Document.js';
import ProcessingJob from '../models/ProcessingJob.js';
import { computeHash } from './articleExtractor.js';

// Comprehensive regex to match YouTube video IDs from all standard URL forms
const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

/**
 * Safely extract the 11-character YouTube video ID from supported URL forms
 */
export const extractVideoId = (url) => {
  if (!url || typeof url !== 'string') return null;
  const cleaned = url.trim();

  const match = cleaned.match(YOUTUBE_REGEX);
  if (match && match[1]) {
    return match[1];
  }

  try {
    const parsed = new URL(cleaned);
    if (parsed.hostname.includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
        return v;
      }
    } else if (parsed.hostname === 'youtu.be') {
      const part = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      if (part && /^[a-zA-Z0-9_-]{11}$/.test(part)) {
        return part;
      }
    }
  } catch {
    // Ignore URL parse errors
  }

  return null;
};

/**
 * Orchestrate YouTube data extraction (transcript, comments, or both) via Python AI service.
 * Reuses video metadata and isolates partial failures without requiring YouTube Data API keys.
 */
export const extractYouTubeData = async ({
  url,
  extractTranscript = true,
  extractComments = false,
  maxComments = 50
}) => {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL. Please provide a valid link (e.g., https://www.youtube.com/watch?v=... or https://youtu.be/...).');
  }

  if (!extractTranscript && !extractComments) {
    throw new Error('At least one extraction option (Transcript or Comments) must be selected.');
  }

  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const aiService = (await import('./aiService.js')).default;

  const result = await aiService.extractYouTubeData(canonicalUrl, {
    extractTranscript: Boolean(extractTranscript),
    extractComments: Boolean(extractComments),
    maxComments: Number(maxComments) || 50
  });

  return result;
};

/**
 * Resolve transcript translation persistence fields consistently across ingestion flows.
 * Reuses pre-translated English text when provided so the batch pipeline never re-translates.
 */
export const resolveTranscriptTranslationFields = (transcriptPayload = {}, fallbackLanguageCode = 'en') => {
  const rawLang = (
    transcriptPayload?.detectedLanguage ||
    transcriptPayload?.detected_language ||
    transcriptPayload?.languageCode ||
    fallbackLanguageCode ||
    'en'
  ).toString().trim() || 'en';

  const translated = typeof transcriptPayload?.translatedText === 'string'
    ? transcriptPayload.translatedText.trim()
    : (typeof transcriptPayload?.translated_text === 'string' ? transcriptPayload.translated_text.trim() : '');

  const status = transcriptPayload?.translationStatus || transcriptPayload?.translation_status || '';

  if (status === 'translated' && translated) {
    return {
      detectedLanguage: rawLang,
      translatedText: translated,
      processingText: translated,
      translationStatus: 'translated',
    };
  }

  return {
    detectedLanguage: rawLang,
    translatedText: '',
    processingText: '',
    translationStatus: 'not_required',
  };
};

/**
 * Prepare deduplicated YouTube comment Document records for a video.
 * Shared across single-URL YouTube ingestion and YouTube Discovery ingestion.
 */
export const prepareYouTubeCommentDocs = async ({
  entityId,
  batchId,
  canonicalVideoUrl,
  videoId,
  videoTitle = 'YouTube Video',
  items = [],
  provenance = 'YouTubeComments',
  existingCanonicalSet = null
}) => {
  const validItems = (Array.isArray(items) ? items : []).filter((c) => {
    if (!c || c.selected === false) return false;
    return typeof c.text === 'string' && c.text.trim().length > 0;
  });

  if (validItems.length === 0) {
    return { commentDocs: [], commentsSkipped: 0 };
  }

  const candidateCanonicalUrls = validItems.map(
    (c) => `${canonicalVideoUrl}#comment_${c.id || c.cid || computeHash(c.text.trim())}`
  );

  let dedupSet = existingCanonicalSet;
  if (!dedupSet) {
    const existingCommentDocs = await Document.find({
      entityId,
      canonicalUrl: { $in: candidateCanonicalUrls }
    }).select('canonicalUrl').lean();
    dedupSet = new Set(existingCommentDocs.map((d) => d.canonicalUrl));
  }

  const commentDocs = [];
  let commentsSkipped = 0;

  for (const comment of validItems) {
    const commentText = comment.text.trim();
    const commentId = comment.id || comment.cid || computeHash(commentText);
    const commentCanonicalUrl = `${canonicalVideoUrl}#comment_${commentId}`;

    if (dedupSet.has(commentCanonicalUrl)) {
      commentsSkipped++;
      continue;
    }

    dedupSet.add(commentCanonicalUrl);

    const publishedRaw = comment.publishedAt || comment.published_at;
    const parsedDate = publishedRaw ? new Date(publishedRaw) : null;
    const validDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null;

    commentDocs.push({
      entityId,
      batchId,
      title: `Comment by ${comment.author || 'Viewer'} on "${videoTitle || 'YouTube Video'}"`.slice(0, 150),
      rawText: commentText,
      source: 'YouTube Comments',
      sourceType: 'social_media',
      author: (comment.author || 'Viewer').trim(),
      url: canonicalVideoUrl,
      canonicalUrl: commentCanonicalUrl,
      contentHash: computeHash(commentText),
      publicationDate: validDate,
      collectedDate: new Date(),
      processingStatus: 'not_processed',
      extractionStatus: 'success',
      metadata: {
        provenance,
        videoId,
        commentId,
        likeCount: Number(comment.likeCount ?? comment.like_count) || 0,
        parentVideoTitle: videoTitle || '',
        extractionType: 'comment'
      }
    });
  }

  return { commentDocs, commentsSkipped };
};

/**
 * Ingest extracted YouTube data (transcript, comments, or both) into MongoDB Document collection.
 * Deduplicates comments and creates ProcessingJob for AI pipeline processing.
 */
export const ingestYouTubeData = async ({
  entityId,
  videoId,
  videoUrl,
  videoTitle,
  videoAuthor,
  videoPublicationDate,
  transcript,
  comments
}) => {
  if (!entityId) {
    throw new Error('Entity ID is required for ingestion');
  }
  if (!videoId) {
    throw new Error('Video ID is required for ingestion');
  }

  const canonicalVideoUrl = videoUrl || `https://www.youtube.com/watch?v=${videoId}`;
  const batchId = `BATCH_YT_${Date.now()}`;
  const docsToInsert = [];

  // 1. Ingest Transcript document if provided and selected
  if (transcript && transcript.include && transcript.rawText && transcript.rawText.trim()) {
    const transcriptText = transcript.rawText.trim();
    const contentHash = computeHash(transcriptText.slice(0, 500));
    const transcriptCanonicalUrl = canonicalVideoUrl;

    // Check duplicate transcript for this entity
    const existingTranscript = await Document.findOne({
      entityId,
      canonicalUrl: transcriptCanonicalUrl,
      source: 'YouTube'
    }).lean();

    if (!existingTranscript) {
      const translationFields = resolveTranscriptTranslationFields(transcript, transcript.languageCode || 'en');
      docsToInsert.push({
        entityId,
        batchId,
        title: (transcript.title || videoTitle || 'YouTube Video Transcript').trim(),
        rawText: transcriptText,
        ...translationFields,
        source: 'YouTube',
        sourceType: 'YouTube Video',
        author: (transcript.author || videoAuthor || 'Unknown').trim(),
        url: canonicalVideoUrl,
        canonicalUrl: transcriptCanonicalUrl,
        contentHash,
        publicationDate: transcript.publicationDate || videoPublicationDate || null,
        collectedDate: new Date(),
        processingStatus: 'not_processed',
        extractionStatus: 'success',
        metadata: {
          provenance: 'YouTubeTranscript',
          videoId,
          extractionType: 'transcript'
        }
      });
    }
  }

  // 2. Ingest Comments documents if provided and selected
  let commentsDuplicatesSkipped = 0;

  if (comments && comments.include && Array.isArray(comments.items) && comments.items.length > 0) {
    const prepared = await prepareYouTubeCommentDocs({
      entityId,
      batchId,
      canonicalVideoUrl,
      videoId,
      videoTitle: videoTitle || 'YouTube Video',
      items: comments.items,
      provenance: 'YouTubeComments'
    });
    docsToInsert.push(...prepared.commentDocs);
    commentsDuplicatesSkipped = prepared.commentsSkipped;
  }

  if (docsToInsert.length === 0) {
    return {
      success: true,
      batchId: null,
      insertedCount: 0,
      transcriptInserted: false,
      commentsInserted: 0,
      commentsSkipped: commentsDuplicatesSkipped,
      message: commentsDuplicatesSkipped > 0
        ? `All ${commentsDuplicatesSkipped} extracted comment(s) have already been ingested into the database.`
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

  // Create corresponding ProcessingJob so the NI pipeline processes these documents
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

  const transcriptSaved = insertedDocs.some(d => d.source === 'YouTube');
  const commentsSaved = insertedDocs.filter(d => d.source === 'YouTube Comments').length;

  return {
    success: true,
    batchId,
    insertedCount: actualSavedCount,
    transcriptInserted: transcriptSaved,
    commentsInserted: commentsSaved,
    commentsSkipped: commentsDuplicatesSkipped,
    message: `Successfully ingested ${actualSavedCount} YouTube document(s) into database (${transcriptSaved ? '1 transcript' : '0 transcripts'}, ${commentsSaved} comments; ${commentsDuplicatesSkipped} duplicates skipped).`,
    documents: insertedDocs
  };
};

export default {
  extractVideoId,
  extractYouTubeData,
  ingestYouTubeData
};
