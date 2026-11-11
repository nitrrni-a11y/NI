import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  PlaySquare, CheckCircle2, AlertCircle, ExternalLink, Loader2, ArrowRight,
  ArrowLeft, CheckSquare, Square, Info, RotateCcw, ThumbsUp, MessageSquare,
  Eye, Clock, Plus, X, FileText, Globe, Upload
} from 'lucide-react';
import { useEntity } from '../context/EntityContext';
import SourceDiscoveryTabs from '../components/SourceDiscoveryTabs';
import YouTubeTranscriptTranslator, {
  getLanguageDisplayLabel,
  isNonEnglishLanguage,
} from '../components/YouTubeTranscriptTranslator';

const YouTubeIcon = ({ size = 20, color = 'currentColor' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill={color} />
  </svg>
);

const getCommentKey = (comment, idx) => comment?.id || comment?.cid || `idx_${idx}`;

const YouTubeDiscovery = () => {
  const { selectedEntity } = useEntity();
  const navigate = useNavigate();

  // Search parameters
  const [queries, setQueries] = useState([]);
  const [newQueryInput, setNewQueryInput] = useState('');
  const [limitPerQuery, setLimitPerQuery] = useState(6);
  const [extractTranscripts, setExtractTranscripts] = useState(true);
  const [extractCommentsOnDiscovery, setExtractCommentsOnDiscovery] = useState(false);
  const [discoveryMaxComments, setDiscoveryMaxComments] = useState(30);
  const [isGeneratingQueries, setIsGeneratingQueries] = useState(false);

  // Discovery state
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState(null);
  const [discoveryError, setDiscoveryError] = useState(null);

  // Master-Detail navigation state ('null' = Master list view, string = Single Video Detail view)
  const [activeVideoId, setActiveVideoId] = useState(null);

  // Active filter tab: 'all' | 'likely' | 'uncertain' | 'with_transcripts'
  const [activeFilter, setActiveFilter] = useState('likely');

  // Selected videos for bulk ingestion / bulk comment extraction
  const [selectedVideoIds, setSelectedVideoIds] = useState(new Set());

  // Translation UI state per videoId
  const [viewModeByVideo, setViewModeByVideo] = useState({});
  const [translatingVideoIds, setTranslatingVideoIds] = useState(new Set());
  const [translationErrorByVideo, setTranslationErrorByVideo] = useState({});

  // On-demand comment extraction UI state
  const [extractingCommentsIds, setExtractingCommentsIds] = useState(new Set());
  const [isBulkExtractingComments, setIsBulkExtractingComments] = useState(false);
  const [detailMaxComments, setDetailMaxComments] = useState(50);
  const [selectedCommentKeysByVideo, setSelectedCommentKeysByVideo] = useState({});

  // Bulk & Single Ingestion state
  const [isIngesting, setIsIngesting] = useState(false);
  const [pushingVideoId, setPushingVideoId] = useState(null);
  const [ingestResult, setIngestResult] = useState(null);
  const [ingestError, setIngestError] = useState(null);
  const [singleIngestResult, setSingleIngestResult] = useState(null);
  const [singleIngestError, setSingleIngestError] = useState(null);

  // Live reference to active video in Detail View
  const activeVideo = activeVideoId
    ? (discoveryResult?.videos || []).find((v) => v.videoId === activeVideoId) || null
    : null;

  // Auto-generate search queries on entity load
  const fetchDefaultQueries = async () => {
    if (!selectedEntity) return;
    setIsGeneratingQueries(true);
    try {
      const aliases = [];
      if (selectedEntity.name?.includes('Raipur')) {
        aliases.push('NIT Raipur', 'NITRR');
      } else if (selectedEntity.aliases && Array.isArray(selectedEntity.aliases)) {
        aliases.push(...selectedEntity.aliases);
      }

      const res = await axios.post('/api/scraper/youtube/generate-queries', {
        entityId: selectedEntity.entityId,
        entityName: selectedEntity.name,
        domain: selectedEntity.domain,
        entityType: selectedEntity.entityType,
        aliases,
      }, { withCredentials: true });

      if (res.data?.queries && Array.isArray(res.data.queries)) {
        setQueries(res.data.queries.slice(0, 6));
      }
    } catch (err) {
      console.warn('Failed to generate YouTube queries automatically:', err.message);
      if (selectedEntity.name) {
        setQueries([
          `${selectedEntity.name} review`,
          `${selectedEntity.name} honest review`,
          `${selectedEntity.name} student experience`,
        ]);
      }
    } finally {
      setIsGeneratingQueries(false);
    }
  };

  useEffect(() => {
    if (selectedEntity) {
      fetchDefaultQueries();
    }
  }, [selectedEntity]);

  const handleAddQuery = (e) => {
    if (e) e.preventDefault();
    const clean = newQueryInput.trim();
    if (!clean) return;
    if (!queries.includes(clean)) {
      setQueries((prev) => [...prev, clean]);
    }
    setNewQueryInput('');
  };

  const handleRemoveQuery = (indexToRemove) => {
    setQueries((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const updateVideoInState = (videoId, updater) => {
    setDiscoveryResult((prev) => {
      if (!prev?.videos) return prev;
      return {
        ...prev,
        videos: prev.videos.map((v) => (v.videoId === videoId ? updater(v) : v)),
      };
    });
  };

  const handleDiscover = async (e) => {
    if (e) e.preventDefault();
    if (queries.length === 0) {
      setDiscoveryError('Please provide at least one search query.');
      return;
    }

    setIsDiscovering(true);
    setDiscoveryError(null);
    setDiscoveryResult(null);
    setActiveVideoId(null);
    setIngestResult(null);
    setIngestError(null);
    setSingleIngestResult(null);
    setSingleIngestError(null);
    setSelectedVideoIds(new Set());
    setViewModeByVideo({});
    setTranslationErrorByVideo({});
    setSelectedCommentKeysByVideo({});

    try {
      const res = await axios.post('/api/scraper/youtube/discover', {
        queries,
        maxResultsPerQuery: limitPerQuery,
        extractTranscripts,
        extractComments: extractCommentsOnDiscovery,
        maxComments: Number(discoveryMaxComments) || 30,
        entityId: selectedEntity?.entityId,
      }, { withCredentials: true });

      setDiscoveryResult(res.data);

      // Initialize selected comments for videos that came back with comments
      const initialCommentKeys = {};
      (res.data.videos || []).forEach((v) => {
        if (v.commentsData?.comments?.length > 0) {
          initialCommentKeys[v.videoId] = v.commentsData.comments.map((c, idx) => getCommentKey(c, idx));
        }
      });
      setSelectedCommentKeysByVideo(initialCommentKeys);

      // Pre-select videos that are likely reviews and not already ingested
      const autoSelected = new Set(
        (res.data.videos || [])
          .filter((v) => v.isLikelyReview && !v.alreadyIngested)
          .map((v) => v.videoId)
      );
      setSelectedVideoIds(autoSelected);

      if (res.data.counts?.likelyReviews > 0) {
        setActiveFilter('likely');
      } else {
        setActiveFilter('all');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to discover YouTube reviews.';
      setDiscoveryError(msg);
    } finally {
      setIsDiscovering(false);
    }
  };

  // --- ON-DEMAND TRANSCRIPT TRANSLATION (ZERO REDUNDANT API CALLS) ---
  const handleTranslateVideoTranscript = async (video) => {
    if (!video?.videoId || !video?.transcriptData?.raw_text?.trim()) return;
    const vid = video.videoId;

    // Reuse cached translation if already translated in state
    if (video.transcriptData.translationStatus === 'translated' && video.transcriptData.translatedText) {
      setViewModeByVideo((prev) => ({ ...prev, [vid]: 'english' }));
      return;
    }

    setTranslatingVideoIds((prev) => new Set(prev).add(vid));
    setTranslationErrorByVideo((prev) => ({ ...prev, [vid]: '' }));

    try {
      const res = await axios.post('/api/documents/youtube/translate', {
        text: video.transcriptData.raw_text,
        sourceLanguage: video.transcriptData.detected_language || null,
      }, { withCredentials: true });

      if (res.data?.translationStatus === 'translated' && res.data?.translatedText) {
        updateVideoInState(vid, (v) => ({
          ...v,
          transcriptData: {
            ...v.transcriptData,
            detected_language: res.data.detectedLanguage || v.transcriptData?.detected_language || 'unknown',
            translatedText: res.data.translatedText,
            translationStatus: 'translated',
          },
        }));
        setViewModeByVideo((prev) => ({ ...prev, [vid]: 'english' }));
      } else {
        updateVideoInState(vid, (v) => ({
          ...v,
          transcriptData: {
            ...v.transcriptData,
            detected_language: res.data?.detectedLanguage || v.transcriptData?.detected_language || 'en',
            translationStatus: 'not_required',
          },
        }));
        setTranslationErrorByVideo((prev) => ({
          ...prev,
          [vid]: 'Transcript is already in English; translation is not required.',
        }));
      }
    } catch (err) {
      setTranslationErrorByVideo((prev) => ({
        ...prev,
        [vid]: err.response?.data?.message || err.message || 'Failed to translate transcript.',
      }));
    } finally {
      setTranslatingVideoIds((prev) => {
        const next = new Set(prev);
        next.delete(vid);
        return next;
      });
    }
  };

  // --- ON-DEMAND COMMENTS EXTRACTION PER VIDEO ---
  const handleExtractCommentsForVideo = async (video, maxLimit = detailMaxComments) => {
    if (!video?.videoId || !video?.url) return;
    const vid = video.videoId;

    setExtractingCommentsIds((prev) => new Set(prev).add(vid));
    updateVideoInState(vid, (v) => ({ ...v, commentsError: null }));

    try {
      const res = await axios.post('/api/documents/youtube/extract', {
        url: video.url,
        extractTranscript: false,
        extractComments: true,
        maxComments: Number(maxLimit) || 50,
      }, { withCredentials: true });

      const commentsRes = res.data?.comments;
      const retrievedList = Array.isArray(commentsRes?.comments) ? commentsRes.comments : [];

      updateVideoInState(vid, (v) => ({
        ...v,
        commentsExtracted: Boolean(commentsRes?.success && retrievedList.length > 0),
        commentsStatus: commentsRes?.status || (retrievedList.length > 0 ? 'success' : 'empty'),
        commentsError: commentsRes?.error || null,
        commentsData: commentsRes || null,
        commentsIngested: false,
      }));

      setSelectedCommentKeysByVideo((prev) => ({
        ...prev,
        [vid]: retrievedList.map((c, idx) => getCommentKey(c, idx)),
      }));
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to extract comments for this video.';
      updateVideoInState(vid, (v) => ({
        ...v,
        commentsExtracted: false,
        commentsStatus: 'failed',
        commentsError: msg,
      }));
    } finally {
      setExtractingCommentsIds((prev) => {
        const next = new Set(prev);
        next.delete(vid);
        return next;
      });
    }
  };

  const handleBulkExtractCommentsForSelected = async () => {
    const targets = (discoveryResult?.videos || []).filter(
      (v) => selectedVideoIds.has(v.videoId) && !v.commentsExtracted
    );
    if (targets.length === 0) return;

    setIsBulkExtractingComments(true);
    setIngestError(null);
    try {
      for (const video of targets) {
        await handleExtractCommentsForVideo(video, detailMaxComments);
      }
    } finally {
      setIsBulkExtractingComments(false);
    }
  };

  // --- SELECTION HELPERS ---
  const handleToggleSelect = (videoId) => {
    setSelectedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  };

  const getFilteredVideos = () => {
    if (!discoveryResult?.videos) return [];
    const list = discoveryResult.videos;
    switch (activeFilter) {
      case 'likely':
        return list.filter((v) => v.isLikelyReview);
      case 'uncertain':
        return list.filter((v) => !v.isLikelyReview);
      case 'with_transcripts':
        return list.filter((v) => v.hasTranscript);
      case 'all':
      default:
        return list;
    }
  };

  const filteredVideos = getFilteredVideos();

  const handleSelectAllFiltered = () => {
    const next = new Set(selectedVideoIds);
    filteredVideos.forEach((v) => {
      if (!v.alreadyIngested) next.add(v.videoId);
    });
    setSelectedVideoIds(next);
  };

  const handleDeselectAllFiltered = () => {
    const next = new Set(selectedVideoIds);
    filteredVideos.forEach((v) => next.delete(v.videoId));
    setSelectedVideoIds(next);
  };

  const handleToggleCommentSelection = (videoId, commentKey) => {
    setSelectedCommentKeysByVideo((prev) => {
      const current = new Set(prev[videoId] || []);
      if (current.has(commentKey)) current.delete(commentKey);
      else current.add(commentKey);
      return { ...prev, [videoId]: Array.from(current) };
    });
  };

  const handleSelectAllCommentsForVideo = (video) => {
    const list = video.commentsData?.comments || [];
    setSelectedCommentKeysByVideo((prev) => ({
      ...prev,
      [video.videoId]: list.map((c, idx) => getCommentKey(c, idx)),
    }));
  };

  const handleDeselectAllCommentsForVideo = (videoId) => {
    setSelectedCommentKeysByVideo((prev) => ({ ...prev, [videoId]: [] }));
  };

  // --- SHARED INGEST PAYLOAD BUILDER & STATE RECONCILIATION ---
  const buildIngestPayloadVideo = (video) => {
    const td = video.transcriptData || {};
    const isPreTranslated = td.translationStatus === 'translated' && Boolean(td.translatedText?.trim());
    const allComments = video.commentsData?.comments || [];
    const selectedKeys = new Set(
      selectedCommentKeysByVideo[video.videoId] ?? allComments.map((c, idx) => getCommentKey(c, idx))
    );
    const chosenComments = allComments.filter((c, idx) => selectedKeys.has(getCommentKey(c, idx)));

    return {
      ...video,
      includeTranscript: !video.alreadyIngested,
      transcript: video.hasTranscript
        ? {
            rawText: td.raw_text || '',
            languageCode: td.detected_language || 'en',
            detectedLanguage: td.detected_language || 'en',
            translatedText: isPreTranslated ? td.translatedText.trim() : '',
            translationStatus: isPreTranslated ? 'translated' : 'not_required',
          }
        : null,
      comments: {
        include: chosenComments.length > 0 && !video.commentsIngested,
        items: chosenComments,
      },
    };
  };

  const markVideosAsIngested = (ingestedVideos) => {
    const ingestedIds = new Set(ingestedVideos.map((v) => v.videoId));
    setDiscoveryResult((prev) => {
      if (!prev?.videos) return prev;
      const updatedVideos = prev.videos.map((v) => {
        if (!ingestedIds.has(v.videoId)) return v;
        const hadComments = (selectedCommentKeysByVideo[v.videoId] || []).length > 0 && v.commentsExtracted;
        return {
          ...v,
          alreadyIngested: true,
          commentsIngested: v.commentsIngested || hadComments,
        };
      });
      const alreadyIngestedCount = updatedVideos.filter((v) => v.alreadyIngested).length;
      return {
        ...prev,
        counts: {
          ...prev.counts,
          alreadyIngested: alreadyIngestedCount,
        },
        videos: updatedVideos,
      };
    });
    setSelectedVideoIds((prev) => {
      const next = new Set(prev);
      ingestedIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  // --- BULK INGEST (Selected Videos) ---
  const handleIngestSelected = async () => {
    if (selectedVideoIds.size === 0) return;
    if (!selectedEntity?.entityId) {
      setIngestError('No active entity selected.');
      return;
    }

    const videosToIngest = (discoveryResult?.videos || [])
      .filter((v) => selectedVideoIds.has(v.videoId))
      .map(buildIngestPayloadVideo);

    if (videosToIngest.length === 0) return;

    setIsIngesting(true);
    setIngestError(null);
    setIngestResult(null);

    try {
      const res = await axios.post('/api/scraper/youtube/discover/ingest', {
        entityId: selectedEntity.entityId,
        videos: videosToIngest,
      }, { withCredentials: true });

      setIngestResult(res.data);
      markVideosAsIngested(videosToIngest);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to ingest selected YouTube reviews.';
      setIngestError(msg);
    } finally {
      setIsIngesting(false);
    }
  };

  // --- SINGLE VIDEO INGEST (Detail View or Card Action) ---
  const handleIngestSingleVideo = async (video) => {
    if (!video || !selectedEntity?.entityId) {
      setSingleIngestError('No active entity selected.');
      return;
    }

    const payloadVideo = buildIngestPayloadVideo(video);
    setPushingVideoId(video.videoId);
    setSingleIngestError(null);
    setSingleIngestResult(null);

    try {
      const res = await axios.post('/api/scraper/youtube/discover/ingest', {
        entityId: selectedEntity.entityId,
        videos: [payloadVideo],
      }, { withCredentials: true });

      setSingleIngestResult(res.data);
      setIngestResult(res.data);
      markVideosAsIngested([payloadVideo]);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to push this video to database.';
      setSingleIngestError(msg);
      setIngestError(msg);
    } finally {
      setPushingVideoId(null);
    }
  };

  const openVideoDetail = (videoId) => {
    setSingleIngestResult(null);
    setSingleIngestError(null);
    setActiveVideoId(videoId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formatNumber = (num) => {
    if (!num && num !== 0) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toLocaleString();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Helper to check if a single video still has un-pushed content (either video itself OR newly extracted unpushed comments)
  const hasUnpushedCommentsForVideo = (video) => {
    if (!video?.commentsExtracted || video.commentsIngested) return false;
    const keys = selectedCommentKeysByVideo[video.videoId] || [];
    return keys.length > 0;
  };

  return (
    <div className="discovery-container" style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '4rem' }}>
      {/* Top Source Discovery Switcher */}
      <SourceDiscoveryTabs activeTab="youtube" />

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(239, 68, 68, 0.12)',
            color: '#ef4444'
          }}>
            <YouTubeIcon size={22} color="#ef4444" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>YouTube Review Discovery</h1>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              Discover reviews and feedback, inspect videos in detail, translate non-English transcripts, extract comments, and ingest individually or in bulk
            </p>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* DETAIL VIEW MODE (When a specific video card is opened)              */}
      {/* ==================================================================== */}
      {activeVideo ? (
        <div>
          {/* Back Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBottom: '1.1rem',
          }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setActiveVideoId(null);
                setSingleIngestResult(null);
                setSingleIngestError(null);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.86rem', fontWeight: 600 }}
            >
              <ArrowLeft size={16} />
              <span>Back to All Discovered Videos</span>
            </button>

            <a
              href={activeVideo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}
            >
              <span>Open Video on YouTube</span>
              <ExternalLink size={14} />
            </a>
          </div>

          {/* Detail Feedback Banners */}
          {singleIngestResult && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              padding: '0.95rem 1.2rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: 'var(--status-success)',
              fontSize: '0.88rem',
              marginBottom: '1.1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
                <div>
                  <strong>{singleIngestResult.message}</strong>
                  {singleIngestResult.batchId && (
                    <div style={{ fontSize: '0.76rem', opacity: 0.85, marginTop: '0.15rem' }}>
                      Batch ID: <code>{singleIngestResult.batchId}</code>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigate(`/entity/${selectedEntity?.entityId}/processing`)}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <span>Run AI Processing</span>
                  <ArrowRight size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate(`/entity/${selectedEntity?.entityId}/data`)}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                >
                  View Documents
                </button>
              </div>
            </div>
          )}

          {singleIngestError && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem',
              padding: '0.9rem 1.1rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: '0.86rem',
              marginBottom: '1.1rem',
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{singleIngestError}</span>
            </div>
          )}

          {/* Video Header & Push Action Card */}
          <div className="card" style={{
            background: 'var(--surface-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.35rem',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: '1.25rem',
          }}>
            <div style={{ display: 'flex', gap: '1.35rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {/* Large Thumbnail */}
              <div style={{
                position: 'relative',
                width: '260px',
                minWidth: '240px',
                height: '150px',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                background: '#000',
                flexShrink: 0,
              }}>
                <img
                  src={activeVideo.thumbnailUrl}
                  alt={activeVideo.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                {activeVideo.durationText && (
                  <span style={{
                    position: 'absolute',
                    bottom: '8px',
                    right: '8px',
                    background: 'rgba(0, 0, 0, 0.84)',
                    color: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}>
                    {activeVideo.durationText}
                  </span>
                )}
              </div>

              {/* Metadata & Push Button */}
              <div style={{ flex: 1, minWidth: '260px' }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  {activeVideo.isLikelyReview ? (
                    <span className="badge" style={{ fontSize: '0.74rem', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--status-success)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                      Likely Review
                    </span>
                  ) : (
                    <span className="badge" style={{ fontSize: '0.74rem', background: 'var(--surface-color-soft)', color: 'var(--text-muted)' }}>
                      Uncertain / Other
                    </span>
                  )}

                  {activeVideo.alreadyIngested && (
                    <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.74rem', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--status-success)', border: '1px solid rgba(16, 185, 129, 0.35)' }}>
                      <CheckCircle2 size={12} />
                      <span>Ingested</span>
                    </span>
                  )}

                  {activeVideo.hasTranscript && activeVideo.transcriptData?.detected_language && (
                    <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.74rem', background: 'rgba(99, 102, 241, 0.12)', color: 'var(--accent-blue)' }}>
                      <Globe size={12} />
                      <span>{getLanguageDisplayLabel(activeVideo.transcriptData.detected_language, activeVideo.transcriptData.language_name)}</span>
                    </span>
                  )}
                </div>

                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.65rem', lineHeight: 1.35 }}>
                  {activeVideo.title}
                </h2>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.9rem',
                  fontSize: '0.82rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '0.75rem',
                }}>
                  <a href={activeVideo.channelUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {activeVideo.channelName}
                  </a>
                  <span>•</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Eye size={14} /> {formatNumber(activeVideo.viewCount)} views
                  </span>
                  <span>•</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <ThumbsUp size={14} /> {formatNumber(activeVideo.likeCount)}
                  </span>
                  <span>•</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <MessageSquare size={14} /> {formatNumber(activeVideo.commentCount)} comments on YouTube
                  </span>
                  {activeVideo.publishedAt && (
                    <>
                      <span>•</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Clock size={14} /> {formatDate(activeVideo.publishedAt)}
                      </span>
                    </>
                  )}
                </div>

                {activeVideo.relevanceReason && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '0.95rem' }}>
                    Discovery query: <strong>{activeVideo.searchQuery}</strong> • Signal: {activeVideo.relevanceReason}
                  </div>
                )}

                {/* Prominent Single Video Push Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {(() => {
                    const canPushCommentsOnly = activeVideo.alreadyIngested && hasUnpushedCommentsForVideo(activeVideo);
                    const isFullyDone = activeVideo.alreadyIngested && !canPushCommentsOnly;
                    const isPushing = pushingVideoId === activeVideo.videoId;
                    const selectedCommentsCount = activeVideo.commentsExtracted
                      ? (selectedCommentKeysByVideo[activeVideo.videoId] || []).length
                      : 0;

                    return (
                      <button
                        type="button"
                        className={isFullyDone ? 'btn btn-secondary' : 'btn btn-primary'}
                        disabled={isPushing || isFullyDone}
                        onClick={() => handleIngestSingleVideo(activeVideo)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.6rem 1.2rem',
                          fontSize: '0.88rem',
                          fontWeight: 600,
                        }}
                      >
                        {isPushing ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            <span>Pushing to Database...</span>
                          </>
                        ) : isFullyDone ? (
                          <>
                            <CheckCircle2 size={16} color="var(--status-success)" />
                            <span>Already Ingested to Database</span>
                          </>
                        ) : canPushCommentsOnly ? (
                          <>
                            <Upload size={16} />
                            <span>Push {selectedCommentsCount} Extracted Comments to Database</span>
                          </>
                        ) : (
                          <>
                            <Upload size={16} />
                            <span>
                              Push This Video to Database
                              {selectedCommentsCount > 0 ? ` (Transcript + ${selectedCommentsCount} Comments)` : ''}
                            </span>
                          </>
                        )}
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Transcript Panel */}
          <div className="card" style={{
            background: 'var(--surface-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: '1.25rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={18} color={activeVideo.hasTranscript ? '#8b5cf6' : 'var(--text-muted)'} />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Video Transcript</h3>
                {activeVideo.hasTranscript && activeVideo.transcriptData && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    ({activeVideo.transcriptData.word_count} words • ~{activeVideo.transcriptData.estimated_reading_minutes} min read
                    {activeVideo.transcriptData.is_generated ? ' • Auto-generated' : ''})
                  </span>
                )}
              </div>
            </div>

            {activeVideo.hasTranscript && activeVideo.transcriptData ? (
              <>
                <YouTubeTranscriptTranslator
                  rawText={activeVideo.transcriptData.raw_text}
                  languageCode={activeVideo.transcriptData.detected_language || 'en'}
                  languageName={activeVideo.transcriptData.language_name || ''}
                  translatedText={activeVideo.transcriptData.translatedText || ''}
                  translationStatus={activeVideo.transcriptData.translationStatus || 'not_required'}
                  viewMode={viewModeByVideo[activeVideo.videoId] || 'original'}
                  isTranslating={translatingVideoIds.has(activeVideo.videoId)}
                  translationError={translationErrorByVideo[activeVideo.videoId] || ''}
                  onTranslate={() => handleTranslateVideoTranscript(activeVideo)}
                  onViewModeChange={(mode) => setViewModeByVideo((prev) => ({ ...prev, [activeVideo.videoId]: mode }))}
                />

                {(() => {
                  const isViewingEnglish =
                    (viewModeByVideo[activeVideo.videoId] || 'original') === 'english' &&
                    activeVideo.transcriptData.translationStatus === 'translated' &&
                    Boolean(activeVideo.transcriptData.translatedText);

                  return (
                    <div style={{
                      padding: '1rem 1.1rem',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--surface-color-soft)',
                      border: `1px solid ${isViewingEnglish ? 'rgba(16, 185, 129, 0.35)' : 'var(--border-color)'}`,
                      maxHeight: '420px',
                      overflowY: 'auto',
                      fontSize: '0.9rem',
                      lineHeight: 1.68,
                      color: 'var(--text-primary)',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {isViewingEnglish
                        ? activeVideo.transcriptData.translatedText
                        : activeVideo.transcriptData.raw_text}
                    </div>
                  );
                })()}
              </>
            ) : (
              <div style={{
                padding: '0.9rem 1rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface-color-soft)',
                border: '1px solid var(--border-color)',
                fontSize: '0.84rem',
                color: 'var(--text-secondary)',
              }}>
                <div style={{ fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-muted)' }}>
                  {activeVideo.transcriptError || 'No captions available for this video.'}
                </div>
                {activeVideo.description && (
                  <div style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                    <strong>Video Description Fallback:</strong>
                    {'\n'}
                    {activeVideo.description}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Comments Panel */}
          <div className="card" style={{
            background: 'var(--surface-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              marginBottom: '0.85rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MessageSquare size={18} color="#6366f1" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Viewer Comments</h3>
                {activeVideo.commentsExtracted && activeVideo.commentsData && (
                  <span className="badge" style={{ fontSize: '0.74rem', background: 'rgba(16, 185, 129, 0.14)', color: 'var(--status-success)' }}>
                    {activeVideo.commentsData.count} Retrieved
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Max:</label>
                <select
                  value={detailMaxComments}
                  onChange={(e) => setDetailMaxComments(Number(e.target.value))}
                  disabled={extractingCommentsIds.has(activeVideo.videoId)}
                  style={{
                    padding: '0.32rem 0.55rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--surface-color-strong)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                  }}
                >
                  {[20, 30, 50, 100].map((n) => (
                    <option key={n} value={n}>{n} comments</option>
                  ))}
                </select>

                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={extractingCommentsIds.has(activeVideo.videoId)}
                  onClick={() => handleExtractCommentsForVideo(activeVideo, detailMaxComments)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.82rem',
                    padding: '0.42rem 0.9rem',
                    fontWeight: 600,
                  }}
                >
                  {extractingCommentsIds.has(activeVideo.videoId) ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Extracting Comments...</span>
                    </>
                  ) : (
                    <>
                      <MessageSquare size={14} />
                      <span>{activeVideo.commentsExtracted ? 'Re-extract Comments' : 'Extract Comments'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {activeVideo.commentsError && (
              <div style={{
                padding: '0.75rem 0.95rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#ef4444',
                fontSize: '0.83rem',
                marginBottom: '0.75rem',
              }}>
                {activeVideo.commentsError}
              </div>
            )}

            {activeVideo.commentsExtracted && activeVideo.commentsData?.comments?.length > 0 ? (
              <div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  marginBottom: '0.75rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                }}>
                  <span>
                    Selected {(selectedCommentKeysByVideo[activeVideo.videoId] || []).length} of {activeVideo.commentsData.comments.length} comments for database ingestion
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleSelectAllCommentsForVideo(activeVideo)}
                      style={{ fontSize: '0.75rem', padding: '0.28rem 0.65rem' }}
                    >
                      Select All Comments
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleDeselectAllCommentsForVideo(activeVideo.videoId)}
                      style={{ fontSize: '0.75rem', padding: '0.28rem 0.65rem' }}
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div className="yt-comments-list" style={{ maxHeight: '460px' }}>
                  {activeVideo.commentsData.comments.map((comment, idx) => {
                    const cKey = getCommentKey(comment, idx);
                    const isChecked = (selectedCommentKeysByVideo[activeVideo.videoId] || []).includes(cKey);
                    return (
                      <div
                        key={cKey}
                        className="yt-comment-card"
                        style={{
                          borderColor: isChecked ? 'var(--accent-blue)' : 'var(--border-color)',
                          display: 'flex',
                          gap: '0.75rem',
                          alignItems: 'flex-start',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleCommentSelection(activeVideo.videoId, cKey)}
                          className="yt-option-checkbox"
                          style={{ marginTop: '0.25rem' }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="yt-comment-header">
                            <span className="yt-comment-author">{comment.author}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                              <span className="yt-comment-likes">
                                <ThumbsUp size={12} />
                                <span>{comment.likeCount ?? comment.like_count ?? 0}</span>
                              </span>
                              {(comment.publishedAt || comment.published_at || comment.time_relative) && (
                                <span className="yt-comment-date">
                                  {comment.publishedAt || comment.published_at
                                    ? formatDate(comment.publishedAt || comment.published_at)
                                    : comment.time_relative}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="yt-comment-text">{comment.text}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{
                padding: '1.1rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface-color-soft)',
                border: '1px dashed var(--border-color)',
                fontSize: '0.84rem',
                color: 'var(--text-muted)',
              }}>
                {activeVideo.commentsStatus === 'disabled'
                  ? 'Comments are disabled by the creator for this video.'
                  : activeVideo.commentsStatus === 'empty'
                  ? 'Zero comments were found on this video.'
                  : 'Comments have not been extracted for this video yet. Click "Extract Comments" above to fetch viewer discussions on demand.'}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ================================================================== */
        /* MASTER LIST VIEW MODE                                              */
        /* ================================================================== */
        <>
          {/* Search Configuration Card */}
          <div className="card" style={{
            background: 'var(--surface-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: '1.5rem'
          }}>
            {/* Entity Banner */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              paddingBottom: '1rem',
              borderBottom: '1px solid var(--border-color)',
              marginBottom: '1rem'
            }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Target Entity Context
                </span>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                  {selectedEntity?.name || 'No Entity Selected'}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem' }}>
                  <span className="badge" style={{ fontSize: '0.75rem', background: 'var(--surface-color-soft)', color: 'var(--text-secondary)' }}>
                    {selectedEntity?.domain || 'General'}
                  </span>
                  <span className="badge" style={{ fontSize: '0.75rem', background: 'var(--surface-color-soft)', color: 'var(--text-secondary)' }}>
                    {selectedEntity?.entityType || 'Organisation'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={fetchDefaultQueries}
                disabled={isGeneratingQueries || isDiscovering}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
              >
                <RotateCcw size={14} className={isGeneratingQueries ? 'animate-spin' : ''} />
                Reset Default Queries
              </button>
            </div>

            {/* Queries Management */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
                Search Queries ({queries.length})
              </label>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                Queries are dynamically generated for <strong>{selectedEntity?.name || 'this organisation'}</strong>. You can inspect, edit, remove, or add custom search terms before starting.
              </p>

              {/* Queries Chips List */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem',
                padding: '0.6rem',
                background: 'var(--surface-color-soft)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                minHeight: '48px',
                alignItems: 'center',
                marginBottom: '0.75rem'
              }}>
                {queries.map((q, idx) => (
                  <span
                    key={idx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.3rem 0.65rem',
                      background: 'var(--surface-color-strong)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      fontSize: '0.82rem',
                      color: 'var(--text-primary)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}
                  >
                    <span>{q}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveQuery(idx)}
                      disabled={isDiscovering}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        padding: 0
                      }}
                      title="Remove query"
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
                {queries.length === 0 && (
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No search queries configured. Add one below.
                  </span>
                )}
              </div>

              {/* Add Query Input */}
              <form onSubmit={handleAddQuery} style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Add another search query (e.g., NIT Raipur faculty review)..."
                  value={newQueryInput}
                  onChange={(e) => setNewQueryInput(e.target.value)}
                  disabled={isDiscovering}
                  style={{
                    flex: 1,
                    padding: '0.55rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--surface-color-strong)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                />
                <button
                  type="submit"
                  className="btn btn-secondary"
                  disabled={!newQueryInput.trim() || isDiscovering}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}
                >
                  <Plus size={15} /> Add Query
                </button>
              </form>
            </div>

            {/* Discovery Options */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '1rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--border-color)',
              alignItems: 'center'
            }}>
              {/* Max Results Per Query */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                  Results per Query: <span style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>{limitPerQuery}</span>
                </label>
                <input
                  type="range"
                  min="2"
                  max="20"
                  step="1"
                  value={limitPerQuery}
                  onChange={(e) => setLimitPerQuery(Number(e.target.value))}
                  disabled={isDiscovering}
                  style={{ width: '100%', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  <span>Fast (2)</span>
                  <span>Balanced (6)</span>
                  <span>Deep (20)</span>
                </div>
              </div>

              {/* Extract Transcripts Toggle */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                <input
                  type="checkbox"
                  id="extractTranscriptsCheck"
                  checked={extractTranscripts}
                  onChange={(e) => setExtractTranscripts(e.target.checked)}
                  disabled={isDiscovering}
                  style={{ marginTop: '0.2rem', cursor: 'pointer' }}
                />
                <div>
                  <label htmlFor="extractTranscriptsCheck" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    Extract Transcripts
                  </label>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Fetches captions automatically for narrative analysis
                  </div>
                </div>
              </div>

              {/* Optional Pre-Discovery Comment Extraction Toggle */}
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                  <input
                    type="checkbox"
                    id="extractCommentsDiscoveryCheck"
                    checked={extractCommentsOnDiscovery}
                    onChange={(e) => setExtractCommentsOnDiscovery(e.target.checked)}
                    disabled={isDiscovering}
                    style={{ marginTop: '0.2rem', cursor: 'pointer' }}
                  />
                  <div>
                    <label htmlFor="extractCommentsDiscoveryCheck" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                      Extract Comments (Optional)
                    </label>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Leave unchecked for fast discovery &amp; fetch per video later
                    </div>
                  </div>
                </div>
                {extractCommentsOnDiscovery && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.45rem', paddingLeft: '1.4rem' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Max / video:</span>
                    {[20, 30, 50].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setDiscoveryMaxComments(num)}
                        disabled={isDiscovering}
                        style={{
                          padding: '0.15rem 0.5rem',
                          fontSize: '0.72rem',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          background: discoveryMaxComments === num ? 'var(--accent-blue)' : 'var(--surface-color-strong)',
                          color: discoveryMaxComments === num ? '#fff' : 'var(--text-secondary)',
                        }}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Run Discovery Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleDiscover}
                  disabled={isDiscovering || queries.length === 0}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    padding: '0.65rem 1.4rem',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                    cursor: 'pointer'
                  }}
                >
                  {isDiscovering ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Discovering &amp; Extracting...</span>
                    </>
                  ) : (
                    <>
                      <PlaySquare size={18} />
                      <span>Discover YouTube Reviews</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {discoveryError && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.9rem 1.1rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: '0.88rem',
              marginBottom: '1.25rem'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{discoveryError}</span>
            </div>
          )}

          {/* Ingestion Success / Error Banner */}
          {ingestResult && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              padding: '1rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: 'var(--status-success)',
              fontSize: '0.9rem',
              marginBottom: '1.25rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <CheckCircle2 size={20} style={{ flexShrink: 0 }} />
                <div>
                  <strong>{ingestResult.message}</strong>
                  {ingestResult.batchId && (
                    <div style={{ fontSize: '0.78rem', opacity: 0.85, marginTop: '0.2rem' }}>
                      Batch ID: <code>{ingestResult.batchId}</code>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigate(`/entity/${selectedEntity?.entityId}/processing`)}
                  style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <span>Run AI Processing</span>
                  <ArrowRight size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate(`/entity/${selectedEntity?.entityId}/data`)}
                  style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
                >
                  View Documents
                </button>
              </div>
            </div>
          )}

          {ingestError && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.9rem 1.1rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: '0.88rem',
              marginBottom: '1.25rem'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{ingestError}</span>
            </div>
          )}

          {/* Discovery Results Section */}
          {discoveryResult && (
            <div>
              {/* Summary Metric Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '0.85rem',
                marginBottom: '1.5rem'
              }}>
                <div className="card" style={{ padding: '0.9rem 1rem', background: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Found</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                    {discoveryResult.counts?.totalResults || 0}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>from {queries.length} queries</div>
                </div>

                <div className="card" style={{ padding: '0.9rem 1rem', background: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Unique Videos</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-blue)', marginTop: '0.2rem' }}>
                    {discoveryResult.counts?.uniqueVideos || 0}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Deduplicated</div>
                </div>

                <div className="card" style={{ padding: '0.9rem 1rem', background: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Likely Reviews</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--status-success)', marginTop: '0.2rem' }}>
                    {discoveryResult.counts?.likelyReviews || 0}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Heuristic matched</div>
                </div>

                <div className="card" style={{ padding: '0.9rem 1rem', background: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Captions Extracted</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#8b5cf6', marginTop: '0.2rem' }}>
                    {discoveryResult.counts?.transcriptsExtracted || 0}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {discoveryResult.counts?.transcriptsUnavailable || 0} unavailable
                  </div>
                </div>

                <div className="card" style={{ padding: '0.9rem 1rem', background: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Already Ingested</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    {discoveryResult.counts?.alreadyIngested || 0}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Existing in DB</div>
                </div>
              </div>

              {/* Action & Filter Toolbar */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.85rem',
                padding: '0.75rem 1rem',
                background: 'var(--surface-color)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                marginBottom: '1rem'
              }}>
                {/* Filter Tabs */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('likely')}
                    style={{
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.8rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid',
                      borderColor: activeFilter === 'likely' ? 'var(--status-success)' : 'var(--border-color)',
                      background: activeFilter === 'likely' ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                      color: activeFilter === 'likely' ? 'var(--status-success)' : 'var(--text-muted)',
                      fontWeight: activeFilter === 'likely' ? 600 : 400,
                      cursor: 'pointer'
                    }}
                  >
                    Likely Reviews ({discoveryResult.counts?.likelyReviews || 0})
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveFilter('all')}
                    style={{
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.8rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid',
                      borderColor: activeFilter === 'all' ? 'var(--accent-blue)' : 'var(--border-color)',
                      background: activeFilter === 'all' ? 'rgba(37, 99, 235, 0.12)' : 'transparent',
                      color: activeFilter === 'all' ? 'var(--accent-blue)' : 'var(--text-muted)',
                      fontWeight: activeFilter === 'all' ? 600 : 400,
                      cursor: 'pointer'
                    }}
                  >
                    All Videos ({discoveryResult.counts?.uniqueVideos || 0})
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveFilter('with_transcripts')}
                    style={{
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.8rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid',
                      borderColor: activeFilter === 'with_transcripts' ? '#8b5cf6' : 'var(--border-color)',
                      background: activeFilter === 'with_transcripts' ? 'rgba(139, 92, 246, 0.12)' : 'transparent',
                      color: activeFilter === 'with_transcripts' ? '#8b5cf6' : 'var(--text-muted)',
                      fontWeight: activeFilter === 'with_transcripts' ? 600 : 400,
                      cursor: 'pointer'
                    }}
                  >
                    With Transcripts ({discoveryResult.counts?.transcriptsExtracted || 0})
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveFilter('uncertain')}
                    style={{
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.8rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid',
                      borderColor: activeFilter === 'uncertain' ? 'var(--text-secondary)' : 'var(--border-color)',
                      background: activeFilter === 'uncertain' ? 'var(--surface-color-soft)' : 'transparent',
                      color: activeFilter === 'uncertain' ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontWeight: activeFilter === 'uncertain' ? 600 : 400,
                      cursor: 'pointer'
                    }}
                  >
                    Uncertain / Other ({discoveryResult.counts?.uncertainOther || 0})
                  </button>
                </div>

                {/* Batch Selection Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleSelectAllFiltered}
                    style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
                  >
                    Select Filtered
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleDeselectAllFiltered}
                    style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
                  >
                    Deselect Filtered
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleBulkExtractCommentsForSelected}
                    disabled={isBulkExtractingComments || selectedVideoIds.size === 0}
                    style={{
                      fontSize: '0.78rem',
                      padding: '0.38rem 0.75rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                    title="Extract viewer comments on demand for selected videos before ingesting"
                  >
                    {isBulkExtractingComments ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Extracting Comments...</span>
                      </>
                    ) : (
                      <>
                        <MessageSquare size={13} />
                        <span>Extract Comments ({selectedVideoIds.size})</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleIngestSelected}
                    disabled={isIngesting || selectedVideoIds.size === 0}
                    style={{
                      fontSize: '0.82rem',
                      padding: '0.45rem 0.95rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontWeight: 600
                    }}
                  >
                    {isIngesting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Pushing to DB...</span>
                      </>
                    ) : (
                      <>
                        <Upload size={14} />
                        <span>Push Selected to Database ({selectedVideoIds.size})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Helper Tip Banner */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                marginBottom: '0.9rem',
                paddingLeft: '0.25rem',
              }}>
                <Info size={14} />
                <span>Click any video card to inspect its full transcript, translate non-English captions, extract viewer comments, or push that video individually.</span>
              </div>

              {/* Videos Master Cards List */}
              {filteredVideos.length === 0 ? (
                <div className="card" style={{
                  textAlign: 'center',
                  padding: '2.5rem',
                  color: 'var(--text-muted)',
                  background: 'var(--surface-color)',
                  borderRadius: 'var(--radius-md)'
                }}>
                  <Info size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.6 }} />
                  <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>No videos match the selected filter.</div>
                  <div style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>Switch to &quot;All Videos&quot; to view all discovered items.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {filteredVideos.map((video) => {
                    const isSelected = selectedVideoIds.has(video.videoId);
                    const langCode = video.transcriptData?.detected_language || 'en';
                    const isNonEn = video.hasTranscript && isNonEnglishLanguage(langCode, video.transcriptData?.raw_text);
                    const isTranslated = video.transcriptData?.translationStatus === 'translated' && Boolean(video.transcriptData?.translatedText);
                    const extractedCommentsCount = video.commentsExtracted ? (video.commentsData?.count || 0) : 0;
                    const isPushingThis = pushingVideoId === video.videoId;

                    return (
                      <div
                        key={video.videoId}
                        className="card"
                        style={{
                          background: 'var(--surface-color)',
                          borderRadius: 'var(--radius-lg)',
                          border: isSelected ? '1.5px solid var(--accent-blue)' : '1px solid var(--border-color)',
                          boxShadow: isSelected ? '0 4px 14px rgba(37, 99, 235, 0.15)' : 'var(--shadow-sm)',
                          padding: '1.1rem',
                          display: 'flex',
                          gap: '1.15rem',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {/* Selection Checkbox */}
                        <div style={{ paddingTop: '0.2rem' }}>
                          <button
                            type="button"
                            onClick={() => !video.alreadyIngested && handleToggleSelect(video.videoId)}
                            disabled={video.alreadyIngested}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: video.alreadyIngested ? 'not-allowed' : 'pointer',
                              padding: 0,
                              color: video.alreadyIngested
                                ? 'var(--text-muted)'
                                : isSelected
                                ? 'var(--accent-blue)'
                                : 'var(--border-color)'
                            }}
                            title={video.alreadyIngested ? 'Already ingested' : 'Select for bulk action'}
                          >
                            {video.alreadyIngested ? (
                              <CheckCircle2 size={20} color="var(--status-success)" />
                            ) : isSelected ? (
                              <CheckSquare size={20} />
                            ) : (
                              <Square size={20} />
                            )}
                          </button>
                        </div>

                        {/* Clickable Thumbnail */}
                        <div
                          onClick={() => openVideoDetail(video.videoId)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openVideoDetail(video.videoId); }}
                          style={{
                            position: 'relative',
                            width: '185px',
                            minWidth: '185px',
                            height: '108px',
                            borderRadius: 'var(--radius-md)',
                            overflow: 'hidden',
                            background: '#000000',
                            flexShrink: 0,
                            cursor: 'pointer',
                          }}
                          title="Click to inspect full video details"
                        >
                          <img
                            src={video.thumbnailUrl}
                            alt={video.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                          {video.durationText && (
                            <span style={{
                              position: 'absolute',
                              bottom: '6px',
                              right: '6px',
                              background: 'rgba(0, 0, 0, 0.82)',
                              color: '#ffffff',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              padding: '2px 5px',
                              borderRadius: '4px'
                            }}>
                              {video.durationText}
                            </span>
                          )}
                        </div>

                        {/* Card Summary Details */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.4rem' }}>
                            <button
                              type="button"
                              onClick={() => openVideoDetail(video.videoId)}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                textAlign: 'left',
                                fontSize: '1rem',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                lineHeight: 1.35,
                                cursor: 'pointer',
                              }}
                            >
                              {video.title}
                            </button>

                            {/* Status Badges */}
                            <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              {video.alreadyIngested && (
                                <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--status-success)', border: '1px solid rgba(16, 185, 129, 0.35)' }}>
                                  <CheckCircle2 size={11} />
                                  <span>Ingested</span>
                                </span>
                              )}

                              {video.isLikelyReview ? (
                                <span className="badge" style={{ fontSize: '0.72rem', background: 'rgba(16, 185, 129, 0.12)', color: 'var(--status-success)', border: '1px solid rgba(16, 185, 129, 0.28)' }}>
                                  Likely Review
                                </span>
                              ) : (
                                <span className="badge" style={{ fontSize: '0.72rem', background: 'var(--surface-color-soft)', color: 'var(--text-muted)' }}>
                                  Uncertain
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Channel & Stats */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '0.85rem',
                            fontSize: '0.78rem',
                            color: 'var(--text-secondary)',
                            marginBottom: '0.55rem'
                          }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{video.channelName}</span>
                            <span>•</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Eye size={13} /> {formatNumber(video.viewCount)} views
                            </span>
                            <span>•</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <ThumbsUp size={13} /> {formatNumber(video.likeCount)}
                            </span>
                            <span>•</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <MessageSquare size={13} /> {formatNumber(video.commentCount)} comments
                            </span>
                            {video.publishedAt && (
                              <>
                                <span>•</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <Clock size={13} /> {formatDate(video.publishedAt)}
                                </span>
                              </>
                            )}
                          </div>

                          {/* Status Pills & Card Actions */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '0.6rem',
                            marginTop: '0.5rem',
                            paddingTop: '0.6rem',
                            borderTop: '1px solid var(--border-color)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.45rem' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                fontSize: '0.74rem',
                                padding: '0.18rem 0.55rem',
                                borderRadius: '999px',
                                background: video.hasTranscript ? 'rgba(139, 92, 246, 0.12)' : 'var(--surface-color-soft)',
                                color: video.hasTranscript ? '#8b5cf6' : 'var(--text-muted)',
                                fontWeight: 600,
                              }}>
                                <FileText size={12} />
                                {video.hasTranscript
                                  ? `Transcript (${getLanguageDisplayLabel(langCode, video.transcriptData?.language_name)})`
                                  : 'No Captions'}
                              </span>

                              {isNonEn && isTranslated && (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  fontSize: '0.74rem',
                                  padding: '0.18rem 0.55rem',
                                  borderRadius: '999px',
                                  background: 'rgba(16, 185, 129, 0.14)',
                                  color: 'var(--status-success)',
                                  fontWeight: 600,
                                }}>
                                  <CheckCircle2 size={11} />
                                  <span>English Translated</span>
                                </span>
                              )}

                              {extractedCommentsCount > 0 && (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  fontSize: '0.74rem',
                                  padding: '0.18rem 0.55rem',
                                  borderRadius: '999px',
                                  background: 'rgba(59, 130, 246, 0.12)',
                                  color: 'var(--accent-blue)',
                                  fontWeight: 600,
                                }}>
                                  <MessageSquare size={11} />
                                  <span>{extractedCommentsCount} Comments Ready</span>
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                              <a
                                href={video.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-secondary"
                                style={{ fontSize: '0.75rem', padding: '0.32rem 0.6rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                title="Watch on YouTube"
                              >
                                <ExternalLink size={12} />
                                <span>YouTube</span>
                              </a>

                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => openVideoDetail(video.videoId)}
                                style={{ fontSize: '0.76rem', padding: '0.32rem 0.7rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}
                              >
                                <span>Inspect Video</span>
                                <ArrowRight size={13} />
                              </button>

                              {!video.alreadyIngested && (
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  disabled={isPushingThis}
                                  onClick={() => handleIngestSingleVideo(video)}
                                  style={{ fontSize: '0.76rem', padding: '0.32rem 0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}
                                >
                                  {isPushingThis ? (
                                    <Loader2 size={12} className="animate-spin" />
                                  ) : (
                                    <Upload size={12} />
                                  )}
                                  <span>{isPushingThis ? 'Pushing...' : 'Push Video'}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default YouTubeDiscovery;
