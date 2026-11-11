import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Compass, CheckCircle2, AlertCircle, ExternalLink, Loader2, ArrowRight,
  ArrowLeft, CheckSquare, Square, Info, RotateCcw, MessageSquare, ThumbsUp,
  Sparkles, Clock, Upload, Filter
} from 'lucide-react';
import { useEntity } from '../context/EntityContext';
import SourceDiscoveryTabs from '../components/SourceDiscoveryTabs';
import YouTubeTranscriptTranslator, {
  isNonEnglishLanguage,
} from '../components/YouTubeTranscriptTranslator';

const getLinkedInCommentKey = (comment, idx) =>
  comment?.id || comment?.commentId || `li_c_${idx}_${(comment?.author || '').slice(0, 12)}`;

const LinkedInDiscovery = () => {
  const { selectedEntity } = useEntity();
  const navigate = useNavigate();

  // Search parameters
  const [organisation, setOrganisation] = useState('');
  const [aliasesInput, setAliasesInput] = useState('');
  const [limitPerQuery, setLimitPerQuery] = useState(20);

  // Discovery states
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState(null);
  const [discoveryError, setDiscoveryError] = useState(null);

  // Master-Detail navigation state ('null' = Master list view, string = Single Post Detail view)
  const [activePostId, setActivePostId] = useState(null);

  // Active filter tab: 'all' | 'Relevant Opinion' | 'News / Announcement' | 'Irrelevant' | 'Uncertain'
  const [activeFilter, setActiveFilter] = useState('Relevant Opinion');

  // Selected posts for bulk ingestion
  const [selectedPostIds, setSelectedPostIds] = useState(new Set());

  // Per-post on-demand comment extraction & selection state
  const [extractingCommentsPostIds, setExtractingCommentsPostIds] = useState(new Set());
  const [detailNumComments, setDetailNumComments] = useState(50);
  const [selectedCommentKeysByPost, setSelectedCommentKeysByPost] = useState({});

  // Per-post optional translation state
  const [translatingPostIds, setTranslatingPostIds] = useState(new Set());
  const [translationErrorByPost, setTranslationErrorByPost] = useState({});
  const [viewModeByPost, setViewModeByPost] = useState({});

  // Bulk & Single Ingestion states
  const [isIngesting, setIsIngesting] = useState(false);
  const [pushingPostId, setPushingPostId] = useState(null);
  const [ingestResult, setIngestResult] = useState(null);
  const [ingestError, setIngestError] = useState(null);
  const [singleIngestResult, setSingleIngestResult] = useState(null);
  const [singleIngestError, setSingleIngestError] = useState(null);

  // Live reference to active post in Detail View
  const activePost = activePostId
    ? (discoveryResult?.posts || []).find((p) => p.id === activePostId) || null
    : null;

  // Auto-populate organisation and aliases from selectedEntity
  useEffect(() => {
    if (selectedEntity) {
      setOrganisation(selectedEntity.name || '');
      if (selectedEntity.name?.includes('Raipur')) {
        setAliasesInput('National Institute of Technology Raipur, NITRR');
      } else if (Array.isArray(selectedEntity.aliases) && selectedEntity.aliases.length > 0) {
        setAliasesInput(selectedEntity.aliases.join(', '));
      } else {
        setAliasesInput('');
      }
    }
  }, [selectedEntity]);

  const updatePostInState = (postId, updater) => {
    setDiscoveryResult((prev) => {
      if (!prev?.posts) return prev;
      return {
        ...prev,
        posts: prev.posts.map((p) => (p.id === postId ? updater(p) : p)),
      };
    });
  };

  const handleDiscover = async (e) => {
    if (e) e.preventDefault();
    const cleanOrg = organisation.trim();
    if (!cleanOrg) {
      setDiscoveryError('Please provide an organisation name.');
      return;
    }

    setIsDiscovering(true);
    setDiscoveryError(null);
    setDiscoveryResult(null);
    setActivePostId(null);
    setIngestResult(null);
    setIngestError(null);
    setSingleIngestResult(null);
    setSingleIngestError(null);
    setSelectedPostIds(new Set());
    setSelectedCommentKeysByPost({});
    setTranslationErrorByPost({});
    setViewModeByPost({});

    const aliases = aliasesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await axios.post('/api/scraper/linkedin/discover', {
        organisation: cleanOrg,
        aliases,
        limit: limitPerQuery,
        entityId: selectedEntity?.entityId,
      }, { withCredentials: true });

      setDiscoveryResult(res.data);

      // Select un-ingested posts classified as "Relevant Opinion" by default
      const relevantIds = new Set(
        (res.data.posts || [])
          .filter((p) => p.classification === 'Relevant Opinion' && !p.alreadyIngested)
          .map((p) => p.id)
      );
      setSelectedPostIds(relevantIds);

      if (res.data.counts?.relevantOpinion > 0) {
        setActiveFilter('Relevant Opinion');
      } else {
        setActiveFilter('all');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to discover and classify LinkedIn opinions.';
      setDiscoveryError(msg);
    } finally {
      setIsDiscovering(false);
    }
  };

  // --- ON-DEMAND TRANSLATION PER POST (ZERO REDUNDANT API CALLS) ---
  const handleTranslatePost = async (post) => {
    if (!post?.id || !post?.rawText?.trim()) return;
    const pid = post.id;

    if (post.translationStatus === 'translated' && post.translatedText) {
      setViewModeByPost((prev) => ({ ...prev, [pid]: 'english' }));
      return;
    }

    setTranslatingPostIds((prev) => new Set(prev).add(pid));
    setTranslationErrorByPost((prev) => ({ ...prev, [pid]: '' }));

    try {
      const res = await axios.post('/api/documents/youtube/translate', {
        text: post.rawText,
        sourceLanguage: post.detectedLanguage || null,
      }, { withCredentials: true });

      if (res.data?.translationStatus === 'translated' && res.data?.translatedText) {
        updatePostInState(pid, (p) => ({
          ...p,
          detectedLanguage: res.data.detectedLanguage || p.detectedLanguage || 'unknown',
          translatedText: res.data.translatedText,
          translationStatus: 'translated',
        }));
        setViewModeByPost((prev) => ({ ...prev, [pid]: 'english' }));
      } else {
        updatePostInState(pid, (p) => ({
          ...p,
          detectedLanguage: res.data?.detectedLanguage || 'en',
          translationStatus: 'not_required',
        }));
        setTranslationErrorByPost((prev) => ({
          ...prev,
          [pid]: 'Post text is already in English; translation is not required.',
        }));
      }
    } catch (err) {
      setTranslationErrorByPost((prev) => ({
        ...prev,
        [pid]: err.response?.data?.message || err.message || 'Failed to translate LinkedIn post.',
      }));
    } finally {
      setTranslatingPostIds((prev) => {
        const next = new Set(prev);
        next.delete(pid);
        return next;
      });
    }
  };

  // --- ON-DEMAND COMMENT EXTRACTION PER POST ---
  const handleExtractCommentsForPost = async (post, numLimit = detailNumComments) => {
    const targetUrl = post?.url || post?.canonicalUrl;
    if (!post?.id || !targetUrl) return;
    const pid = post.id;

    setExtractingCommentsPostIds((prev) => new Set(prev).add(pid));
    updatePostInState(pid, (p) => ({ ...p, commentsExtractError: null }));

    try {
      const res = await axios.post('/api/scraper/linkedin/extract', {
        url: targetUrl,
        numComments: Math.min(100, Math.max(10, Number(numLimit) || 50)),
      }, { withCredentials: true });

      const extractedComments = Array.isArray(res.data?.comments) ? res.data.comments : [];
      const metrics = res.data?.metrics || null;

      updatePostInState(pid, (p) => ({
        ...p,
        commentsExtracted: true,
        comments: extractedComments,
        commentsMetrics: metrics,
        commentsExtractError: null,
        commentsIngested: false,
      }));

      setSelectedCommentKeysByPost((prev) => ({
        ...prev,
        [pid]: extractedComments.map((c, idx) => getLinkedInCommentKey(c, idx)),
      }));
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to extract comments for this LinkedIn post.';
      updatePostInState(pid, (p) => ({
        ...p,
        commentsExtractError: msg,
      }));
    } finally {
      setExtractingCommentsPostIds((prev) => {
        const next = new Set(prev);
        next.delete(pid);
        return next;
      });
    }
  };

  // --- SELECTION HELPERS ---
  const handleToggleSelect = (postId) => {
    setSelectedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  const filteredPosts = useMemo(() => {
    if (!discoveryResult?.posts) return [];
    if (activeFilter === 'all') return discoveryResult.posts;
    return discoveryResult.posts.filter((p) => p.classification === activeFilter);
  }, [discoveryResult, activeFilter]);

  const handleSelectAllFiltered = () => {
    setSelectedPostIds((prev) => {
      const next = new Set(prev);
      filteredPosts.forEach((p) => {
        if (!p.alreadyIngested) next.add(p.id);
      });
      return next;
    });
  };

  const handleDeselectAllFiltered = () => {
    setSelectedPostIds((prev) => {
      const next = new Set(prev);
      filteredPosts.forEach((p) => next.delete(p.id));
      return next;
    });
  };

  const handleToggleCommentSelection = (postId, commentKey) => {
    setSelectedCommentKeysByPost((prev) => {
      const current = new Set(prev[postId] || []);
      if (current.has(commentKey)) current.delete(commentKey);
      else current.add(commentKey);
      return { ...prev, [postId]: Array.from(current) };
    });
  };

  const handleSelectAllCommentsForPost = (post) => {
    const list = post.comments || [];
    setSelectedCommentKeysByPost((prev) => ({
      ...prev,
      [post.id]: list.map((c, idx) => getLinkedInCommentKey(c, idx)),
    }));
  };

  const handleDeselectAllCommentsForPost = (postId) => {
    setSelectedCommentKeysByPost((prev) => ({ ...prev, [postId]: [] }));
  };

  // --- SHARED INGESTION PAYLOAD BUILDER & STATE RECONCILIATION ---
  const buildIngestPostPayload = (post) => {
    const allComments = Array.isArray(post.comments) ? post.comments : [];
    const selectedKeys = new Set(
      selectedCommentKeysByPost[post.id] ?? allComments.map((c, idx) => getLinkedInCommentKey(c, idx))
    );
    const chosenComments = post.commentsIngested
      ? []
      : allComments.filter((c, idx) => selectedKeys.has(getLinkedInCommentKey(c, idx)));

    const isPreTranslated = post.translationStatus === 'translated' && Boolean(post.translatedText?.trim());

    return {
      ...post,
      includePost: !post.alreadyIngested,
      detectedLanguage: post.detectedLanguage || 'en',
      translatedText: isPreTranslated ? post.translatedText.trim() : '',
      translationStatus: isPreTranslated ? 'translated' : 'not_required',
      selectedComments: chosenComments,
    };
  };

  const markPostsAsIngested = (ingestedPayloadPosts) => {
    const ingestedIds = new Set(ingestedPayloadPosts.map((p) => p.id));
    setDiscoveryResult((prev) => {
      if (!prev?.posts) return prev;
      const updatedPosts = prev.posts.map((p) => {
        if (!ingestedIds.has(p.id)) return p;
        const hadComments = (selectedCommentKeysByPost[p.id] || []).length > 0 && p.commentsExtracted;
        return {
          ...p,
          alreadyIngested: true,
          isIngested: true,
          commentsIngested: p.commentsIngested || hadComments,
        };
      });
      return {
        ...prev,
        counts: {
          ...prev.counts,
          alreadyIngested: updatedPosts.filter((p) => p.alreadyIngested).length,
        },
        posts: updatedPosts,
      };
    });
    setSelectedPostIds((prev) => {
      const next = new Set(prev);
      ingestedIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  // --- BULK INGEST ---
  const handleIngestSelected = async () => {
    if (!discoveryResult?.posts || selectedPostIds.size === 0) return;
    if (!selectedEntity?.entityId) {
      setIngestError('Please select an entity before ingesting documents.');
      return;
    }

    const postsToIngest = discoveryResult.posts
      .filter((p) => selectedPostIds.has(p.id))
      .map(buildIngestPostPayload);

    if (postsToIngest.length === 0) return;

    setIsIngesting(true);
    setIngestError(null);
    setIngestResult(null);

    try {
      const res = await axios.post('/api/scraper/linkedin/discover/ingest', {
        entityId: selectedEntity.entityId,
        posts: postsToIngest,
      }, { withCredentials: true });

      setIngestResult(res.data);
      markPostsAsIngested(postsToIngest);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to ingest selected LinkedIn opinion posts.';
      setIngestError(msg);
    } finally {
      setIsIngesting(false);
    }
  };

  // --- SINGLE POST INGEST (Detail View or Quick Card Action) ---
  const handleIngestSinglePost = async (post) => {
    if (!post || !selectedEntity?.entityId) {
      setSingleIngestError('Please select an entity before pushing to database.');
      return;
    }

    const payloadPost = buildIngestPostPayload(post);
    setPushingPostId(post.id);
    setSingleIngestError(null);
    setSingleIngestResult(null);

    try {
      const res = await axios.post('/api/scraper/linkedin/discover/ingest', {
        entityId: selectedEntity.entityId,
        posts: [payloadPost],
      }, { withCredentials: true });

      setSingleIngestResult(res.data);
      setIngestResult(res.data);
      markPostsAsIngested([payloadPost]);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to push LinkedIn post to database.';
      setSingleIngestError(msg);
      setIngestError(msg);
    } finally {
      setPushingPostId(null);
    }
  };

  const openPostDetail = (postId) => {
    setSingleIngestResult(null);
    setSingleIngestError(null);
    setActivePostId(postId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReset = () => {
    setDiscoveryResult(null);
    setDiscoveryError(null);
    setActivePostId(null);
    setIngestResult(null);
    setIngestError(null);
    setSingleIngestResult(null);
    setSingleIngestError(null);
    setSelectedPostIds(new Set());
    setSelectedCommentKeysByPost({});
  };

  const getClassificationBadgeStyle = (classification) => {
    switch (classification) {
      case 'Relevant Opinion':
        return { backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#16a34a', border: '1px solid rgba(34, 197, 94, 0.3)' };
      case 'News / Announcement':
        return { backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#2563eb', border: '1px solid rgba(59, 130, 246, 0.3)' };
      case 'Irrelevant':
        return { backgroundColor: 'rgba(148, 163, 184, 0.15)', color: '#64748b', border: '1px solid rgba(148, 163, 184, 0.3)' };
      default:
        return { backgroundColor: 'rgba(234, 179, 8, 0.15)', color: '#ca8a04', border: '1px solid rgba(234, 179, 8, 0.3)' };
    }
  };

  const hasUnpushedCommentsForPost = (post) => {
    if (!post?.commentsExtracted || post.commentsIngested) return false;
    return (selectedCommentKeysByPost[post.id] || []).length > 0;
  };

  return (
    <div style={{ paddingBottom: '60px' }}>
      {/* Top Source Discovery Switcher */}
      <SourceDiscoveryTabs activeTab="linkedin" />

      {/* Page Header */}
      <div className="flex flex-col mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: 'rgba(2, 132, 199, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
            <Compass size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              LinkedIn Opinion Discovery
            </h1>
            <p className="text-secondary" style={{ fontSize: '0.95rem', margin: 0 }}>
              Discover public LinkedIn posts classified by <span className="font-semibold text-primary">Llama-3.1-8B</span>, inspect individual posts, extract audience comments on demand, and ingest individually or in bulk.
            </p>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SINGLE POST DETAIL VIEW (When a post card is opened)                 */}
      {/* ==================================================================== */}
      {activePost ? (
        <div className="space-y-5">
          {/* Back Navigation & External Link */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setActivePostId(null);
                setSingleIngestResult(null);
                setSingleIngestError(null);
              }}
              className="btn btn-secondary text-sm flex items-center gap-2 font-semibold"
            >
              <ArrowLeft size={16} />
              <span>Back to All Discovered Posts</span>
            </button>

            <a
              href={activePost.url || activePost.canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary text-xs flex items-center gap-1.5"
            >
              <span>Open Original Post on LinkedIn</span>
              <ExternalLink size={14} />
            </a>
          </div>

          {/* Detail Feedback Banners */}
          {singleIngestResult && (
            <div
              className="p-4 rounded-xl border flex flex-col gap-3"
              style={{ backgroundColor: 'rgba(34, 197, 94, 0.08)', borderColor: 'rgba(34, 197, 94, 0.25)', color: 'var(--text-primary)' }}
            >
              <div className="flex items-start gap-2.5">
                <CheckCircle2 size={20} className="text-green-500 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-green-600 dark:text-green-400">
                    {singleIngestResult.message}
                  </div>
                  {singleIngestResult.batchId && (
                    <div className="text-xs text-muted mt-1 font-mono">
                      Batch ID: {singleIngestResult.batchId}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 pl-7">
                <button
                  type="button"
                  onClick={() => navigate(`/entity/${selectedEntity?.entityId}/data`)}
                  className="btn btn-secondary text-xs"
                >
                  View In Documents Table
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/entity/${selectedEntity?.entityId}/processing`)}
                  className="btn btn-primary text-xs flex items-center gap-1.5"
                >
                  <span>Proceed to AI Processing</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          )}

          {singleIngestError && (
            <div
              className="p-4 rounded-xl border text-sm flex items-start gap-2.5"
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.25)', color: 'var(--text-primary)' }}
            >
              <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div>{singleIngestError}</div>
            </div>
          )}

          {/* Post Overview & Prominent Single Push Card */}
          <div className="card shadow-sm" style={{ borderColor: 'var(--border-color)', background: 'var(--surface-color)' }}>
            <div className="flex items-start justify-between flex-wrap gap-4 pb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex-1 min-w-[260px]">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span
                    className="px-2.5 py-0.5 rounded text-xs font-bold"
                    style={getClassificationBadgeStyle(activePost.classification)}
                  >
                    {activePost.classification}
                  </span>
                  {activePost.opinion_type && activePost.opinion_type !== 'None' && (
                    <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-secondary border border-gray-200 dark:border-gray-700">
                      {activePost.opinion_type}
                    </span>
                  )}
                  {activePost.alreadyIngested && (
                    <span
                      className="px-2.5 py-0.5 rounded text-xs font-bold flex items-center gap-1"
                      style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--status-success)', border: '1px solid rgba(16, 185, 129, 0.3)' }}
                    >
                      <CheckCircle2 size={12} />
                      <span>Ingested</span>
                    </span>
                  )}
                </div>

                <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0.25rem 0 0.2rem' }}>
                  {activePost.author}
                </h2>
                {activePost.authorHeadline && (
                  <p className="text-sm text-secondary mb-2">{activePost.authorHeadline}</p>
                )}

                <div className="flex items-center flex-wrap gap-4 text-xs text-muted">
                  {activePost.publicationDate && (
                    <span className="flex items-center gap-1">
                      <Clock size={13} />
                      {new Date(activePost.publicationDate).toLocaleDateString()}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <ThumbsUp size={13} /> {activePost.likesCount || 0} likes
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare size={13} /> {activePost.commentsCount || 0} comments on LinkedIn
                  </span>
                  <span>Query: &quot;{activePost.matchedQuery}&quot;</span>
                </div>
              </div>

              {/* Single Push Action Button */}
              <div>
                {(() => {
                  const selectedCommentsCount = activePost.commentsExtracted
                    ? (selectedCommentKeysByPost[activePost.id] || []).length
                    : 0;
                  const canPushCommentsOnly = activePost.alreadyIngested && hasUnpushedCommentsForPost(activePost);
                  const isFullyDone = activePost.alreadyIngested && !canPushCommentsOnly;
                  const isPushing = pushingPostId === activePost.id;

                  let buttonLabel = 'Push This Post to Database';
                  if (canPushCommentsOnly) {
                    buttonLabel = `Push ${selectedCommentsCount} Comment${selectedCommentsCount === 1 ? '' : 's'} to Database`;
                  } else if (selectedCommentsCount > 0) {
                    buttonLabel = `Push Post + ${selectedCommentsCount} Comment${selectedCommentsCount === 1 ? '' : 's'} to Database`;
                  }

                  return (
                    <button
                      type="button"
                      disabled={isPushing || isFullyDone}
                      onClick={() => handleIngestSinglePost(activePost)}
                      className={isFullyDone ? 'btn btn-secondary' : 'btn font-semibold'}
                      style={
                        isFullyDone
                          ? { display: 'inline-flex', alignItems: 'center', gap: '0.45rem', cursor: 'default' }
                          : {
                              background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                              color: '#ffffff',
                              border: 'none',
                              padding: '0.65rem 1.3rem',
                              borderRadius: '8px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.45rem',
                              cursor: isPushing ? 'not-allowed' : 'pointer',
                            }
                      }
                    >
                      {isPushing ? (
                        <>
                          <Loader2 size={16} className="spin" />
                          <span>Pushing to Database...</span>
                        </>
                      ) : isFullyDone ? (
                        <>
                          <CheckCircle2 size={16} className="text-green-500" />
                          <span>Already Ingested ✓</span>
                        </>
                      ) : (
                        <>
                          <Upload size={16} />
                          <span>{buttonLabel}</span>
                        </>
                      )}
                    </button>
                  );
                })()}
              </div>
            </div>

            {/* Llama-3.1-8B Classification Reasoning */}
            <div
              className="p-3.5 my-4 rounded-xl border text-xs leading-relaxed"
              style={{
                backgroundColor: activePost.classification === 'Relevant Opinion' ? 'rgba(34, 197, 94, 0.06)' : 'var(--surface-color-soft)',
                borderColor: activePost.classification === 'Relevant Opinion' ? 'rgba(34, 197, 94, 0.25)' : 'var(--border-color)',
                color: 'var(--text-secondary)',
              }}
            >
              <strong className="text-primary">Llama-3.1-8B Opinion Classification:</strong> {activePost.reason}
            </div>

            {/* Optional On-Demand Translation Controls + Full Post Text */}
            {(isNonEnglishLanguage(activePost.detectedLanguage || 'en', activePost.rawText) ||
              activePost.translationStatus === 'translated') && (
              <YouTubeTranscriptTranslator
                rawText={activePost.rawText}
                languageCode={activePost.detectedLanguage || 'unknown'}
                languageName=""
                translatedText={activePost.translatedText || ''}
                translationStatus={activePost.translationStatus || 'not_required'}
                viewMode={viewModeByPost[activePost.id] || 'original'}
                isTranslating={translatingPostIds.has(activePost.id)}
                translationError={translationErrorByPost[activePost.id] || ''}
                contentLabel="post"
                onTranslate={() => handleTranslatePost(activePost)}
                onViewModeChange={(mode) => setViewModeByPost((prev) => ({ ...prev, [activePost.id]: mode }))}
              />
            )}

            {/* Also allow manual translation trigger even if detected script is ambiguous/romanized */}
            {!isNonEnglishLanguage(activePost.detectedLanguage || 'en', activePost.rawText) &&
              activePost.translationStatus !== 'translated' && (
                <div className="mb-3 flex justify-end">
                  <YouTubeTranscriptTranslator
                    rawText={activePost.rawText}
                    languageCode={activePost.detectedLanguage || 'en'}
                    languageName="English / Auto"
                    translatedText={activePost.translatedText || ''}
                    translationStatus={activePost.translationStatus || 'not_required'}
                    viewMode={viewModeByPost[activePost.id] || 'original'}
                    isTranslating={translatingPostIds.has(activePost.id)}
                    translationError={translationErrorByPost[activePost.id] || ''}
                    contentLabel="post"
                    onTranslate={() => handleTranslatePost(activePost)}
                    onViewModeChange={(mode) => setViewModeByPost((prev) => ({ ...prev, [activePost.id]: mode }))}
                  />
                </div>
              )}

            {(() => {
              const isViewingEnglish =
                (viewModeByPost[activePost.id] || 'original') === 'english' &&
                activePost.translationStatus === 'translated' &&
                Boolean(activePost.translatedText);

              return (
                <div
                  className="p-4 rounded-xl border text-sm leading-relaxed"
                  style={{
                    backgroundColor: 'var(--bg-color)',
                    borderColor: isViewingEnglish ? 'rgba(16, 185, 129, 0.35)' : 'var(--border-color)',
                    color: 'var(--text-primary)',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '420px',
                    overflowY: 'auto',
                  }}
                >
                  {isViewingEnglish ? activePost.translatedText : activePost.rawText}
                </div>
              );
            })()}
          </div>

          {/* On-Demand Comment Extraction Section */}
          <div className="card shadow-sm" style={{ borderColor: 'var(--border-color)', background: 'var(--surface-color)' }}>
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-2.5">
                <MessageSquare size={18} className="text-blue-500" />
                <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 600 }}>
                  Post Comments Extraction
                </h3>
                {activePost.commentsExtracted && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: 'rgba(16, 185, 129, 0.14)', color: 'var(--status-success)' }}>
                    {(activePost.comments || []).length} Retained
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs text-muted font-medium">Max Comments:</label>
                <input
                  type="number"
                  min="10"
                  max="100"
                  step="10"
                  value={detailNumComments}
                  onChange={(e) => setDetailNumComments(Math.min(100, Math.max(10, Number(e.target.value) || 50)))}
                  disabled={extractingCommentsPostIds.has(activePost.id)}
                  className="form-control text-xs"
                  style={{ width: '76px', textAlign: 'center', fontWeight: 600 }}
                />
                <button
                  type="button"
                  disabled={extractingCommentsPostIds.has(activePost.id)}
                  onClick={() => handleExtractCommentsForPost(activePost, detailNumComments)}
                  className="btn btn-primary text-xs font-semibold flex items-center gap-1.5"
                >
                  {extractingCommentsPostIds.has(activePost.id) ? (
                    <>
                      <Loader2 size={14} className="spin" />
                      <span>Extracting via Apify...</span>
                    </>
                  ) : (
                    <>
                      <MessageSquare size={14} />
                      <span>{activePost.commentsExtracted ? 'Re-extract Comments' : 'Extract Comments'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Extraction Error */}
            {activePost.commentsExtractError && (
              <div
                className="p-3.5 mt-4 rounded-xl border text-xs flex items-start gap-2"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.25)', color: '#ef4444' }}
              >
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{activePost.commentsExtractError}</span>
              </div>
            )}

            {/* Extraction Telemetry & Noise Filter Summary */}
            {activePost.commentsMetrics && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border text-xs" style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border-color)' }}>
                <div className="flex items-center gap-4 flex-wrap">
                  <span>
                    Scraped: <strong>{activePost.commentsMetrics.totalRetrieved || 0}</strong>
                  </span>
                  <span style={{ color: 'var(--status-success)' }}>
                    Retained (Cleaned): <strong>{activePost.commentsMetrics.totalRetained || 0}</strong>
                  </span>
                  <span className="text-muted flex items-center gap-1">
                    <Filter size={12} />
                    Filtered Noise: <strong>{activePost.commentsMetrics.filteredCount || 0}</strong>
                  </span>
                </div>
                {activePost.commentsMetrics.truncationNotice && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {activePost.commentsMetrics.truncationNotice}
                  </span>
                )}
              </div>
            )}

            {/* Comments Checkable List */}
            {activePost.commentsExtracted ? (
              (activePost.comments || []).length > 0 ? (
                <div className="mt-4">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-3 text-xs text-secondary">
                    <span>
                      Selected <strong>{(selectedCommentKeysByPost[activePost.id] || []).length}</strong> of <strong>{activePost.comments.length}</strong> comments for database ingestion
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectAllCommentsForPost(activePost)}
                        className="btn btn-secondary text-xs py-1 px-2.5"
                      >
                        Select All Comments
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeselectAllCommentsForPost(activePost.id)}
                        className="btn btn-secondary text-xs py-1 px-2.5"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  <div className="yt-comments-list" style={{ maxHeight: '460px' }}>
                    {activePost.comments.map((comment, idx) => {
                      const cKey = getLinkedInCommentKey(comment, idx);
                      const isChecked = (selectedCommentKeysByPost[activePost.id] || []).includes(cKey);
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
                            onChange={() => handleToggleCommentSelection(activePost.id, cKey)}
                            className="yt-option-checkbox"
                            style={{ marginTop: '0.25rem' }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="yt-comment-header">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="yt-comment-author">{comment.author || 'LinkedIn User'}</span>
                                {comment.authorHeadline && (
                                  <span className="text-xs text-muted truncate max-w-xs" title={comment.authorHeadline}>
                                    • {comment.authorHeadline}
                                  </span>
                                )}
                                {comment.isReply && comment.parentAuthor && (
                                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-medium">
                                    Reply to {comment.parentAuthor}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="yt-comment-likes">
                                  <ThumbsUp size={12} />
                                  <span>{comment.likesCount || 0}</span>
                                </span>
                                {comment.publicationDate && (
                                  <span className="yt-comment-date">
                                    {new Date(comment.publicationDate).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="yt-comment-text">{comment.rawText}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div
                  className="p-4 mt-4 rounded-xl border text-xs text-muted"
                  style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border-color)' }}
                >
                  Extraction completed, but no substantive comments remained after noise filtering (or comments are restricted for this post).
                </div>
              )
            ) : (
              <div
                className="p-4 mt-4 rounded-xl border text-xs text-muted"
                style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border-color)', borderStyle: 'dashed' }}
              >
                Comments have not been extracted for this post yet. Click <strong>&quot;Extract Comments&quot;</strong> above to fetch &amp; filter audience discussions on demand via Apify.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ================================================================== */
        /* MASTER LIST VIEW MODE                                              */
        /* ================================================================== */
        <>
          {/* SEARCH CARD */}
          <div className="card shadow-sm mb-6" style={{ borderColor: 'var(--border-color)', background: 'var(--surface-color)' }}>
            <form onSubmit={handleDiscover} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Organisation Name *
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="e.g., NIT Raipur, IIT Bombay, Harvard University"
                      value={organisation}
                      onChange={(e) => setOrganisation(e.target.value)}
                      disabled={isDiscovering || isIngesting}
                      className="form-control"
                      style={{ flex: 1, fontSize: '0.875rem' }}
                      required
                    />
                  </div>
                  <p className="text-xs text-muted mt-1.5">
                    Primary organisation name queried across public LinkedIn post discussions.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Alternative Names / Aliases (Comma-separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., National Institute of Technology Raipur, NITRR"
                    value={aliasesInput}
                    onChange={(e) => setAliasesInput(e.target.value)}
                    disabled={isDiscovering || isIngesting}
                    className="form-control"
                    style={{ width: '100%', fontSize: '0.875rem' }}
                  />
                  <p className="text-xs text-muted mt-1.5">
                    Acronyms and alternate names searched to ensure comprehensive discovery.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl border" style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border-color)' }}>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-secondary">
                    Max Posts per Search Query
                  </div>
                  <div className="text-xs text-muted">
                    Configurable results per search variant (5 to 50). Duplicates across queries are automatically merged.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="5"
                    max="50"
                    step="5"
                    value={limitPerQuery}
                    onChange={(e) => setLimitPerQuery(Math.min(50, Math.max(5, Number(e.target.value) || 20)))}
                    disabled={isDiscovering || isIngesting}
                    className="form-control"
                    style={{ width: '80px', textAlign: 'center', fontWeight: 600 }}
                  />
                  <span className="text-xs text-muted">posts / query</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="text-xs text-muted">
                  {discoveryResult ? (
                    <span className="text-green-600 dark:text-green-400 font-semibold flex items-center gap-1.5">
                      <CheckCircle2 size={15} /> Discovered {discoveryResult.totalUnique} unique posts. Filtered with Llama-3.1-8B.
                    </span>
                  ) : (
                    <span>Searches public posts via Apify and classifies direct opinions using Llama-3.1-8B SLM.</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {discoveryResult && (
                    <button
                      type="button"
                      onClick={handleReset}
                      disabled={isDiscovering || isIngesting}
                      className="btn btn-secondary text-xs flex items-center gap-1.5"
                    >
                      <RotateCcw size={13} />
                      <span>Reset Search</span>
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isDiscovering || isIngesting || !organisation.trim()}
                    className="btn font-semibold flex items-center gap-2 shadow-sm"
                    style={{
                      background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.65rem 1.4rem',
                      borderRadius: '8px',
                      cursor: isDiscovering ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {isDiscovering ? (
                      <>
                        <Loader2 size={16} className="spin" />
                        <span>Discovering &amp; Classifying...</span>
                      </>
                    ) : (
                      <>
                        <Compass size={16} />
                        <span>Discover &amp; Classify Opinions</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>

            {/* Error Alert */}
            {discoveryError && (
              <div
                className="p-4 mt-4 rounded-xl border flex flex-col gap-2"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.25)', color: 'var(--text-primary)' }}
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                  <div className="text-sm font-medium">{discoveryError}</div>
                </div>
                {discoveryError.toLowerCase().includes('apify_api_token') && (
                  <div className="text-xs text-secondary pl-7">
                    <strong>Setup Hint:</strong> Add <code>APIFY_API_TOKEN=your_token</code> to <code>backend/.env</code> and restart backend.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* DISCOVERY RESULTS SECTION */}
          {discoveryResult && (
            <div className="space-y-6">
              {/* STATS METRIC CARDS */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div
                  onClick={() => setActiveFilter('all')}
                  className="card shadow-sm text-center p-3 cursor-pointer transition-all"
                  style={{
                    borderColor: activeFilter === 'all' ? 'var(--accent-blue)' : 'var(--border-color)',
                    backgroundColor: activeFilter === 'all' ? 'var(--surface-color-soft)' : 'var(--surface-color)'
                  }}
                >
                  <div className="text-xs text-muted uppercase font-semibold">Total Unique</div>
                  <div className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
                    {discoveryResult.totalUnique}
                  </div>
                </div>

                <div
                  onClick={() => setActiveFilter('Relevant Opinion')}
                  className="card shadow-sm text-center p-3 cursor-pointer transition-all"
                  style={{
                    borderColor: activeFilter === 'Relevant Opinion' ? '#16a34a' : 'rgba(34, 197, 94, 0.3)',
                    backgroundColor: 'rgba(34, 197, 94, 0.08)'
                  }}
                >
                  <div className="text-xs text-green-600 dark:text-green-400 uppercase font-semibold flex items-center justify-center gap-1">
                    <Sparkles size={12} />
                    <span>Relevant Opinions</span>
                  </div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                    {discoveryResult.counts.relevantOpinion}
                  </div>
                </div>

                <div
                  onClick={() => setActiveFilter('News / Announcement')}
                  className="card shadow-sm text-center p-3 cursor-pointer transition-all"
                  style={{
                    borderColor: activeFilter === 'News / Announcement' ? '#2563eb' : 'rgba(59, 130, 246, 0.3)',
                    backgroundColor: 'rgba(59, 130, 246, 0.08)'
                  }}
                >
                  <div className="text-xs text-blue-600 dark:text-blue-400 uppercase font-semibold">News / Updates</div>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                    {discoveryResult.counts.newsAnnouncement}
                  </div>
                </div>

                <div
                  onClick={() => setActiveFilter('Irrelevant')}
                  className="card shadow-sm text-center p-3 cursor-pointer transition-all"
                  style={{
                    borderColor: activeFilter === 'Irrelevant' ? '#64748b' : 'rgba(148, 163, 184, 0.3)',
                    backgroundColor: 'rgba(148, 163, 184, 0.08)'
                  }}
                >
                  <div className="text-xs text-muted uppercase font-semibold">Irrelevant</div>
                  <div className="text-2xl font-bold text-secondary mt-1">
                    {discoveryResult.counts.irrelevant}
                  </div>
                </div>

                <div
                  onClick={() => setActiveFilter('Uncertain')}
                  className="card shadow-sm text-center p-3 cursor-pointer transition-all"
                  style={{
                    borderColor: activeFilter === 'Uncertain' ? '#ca8a04' : 'rgba(234, 179, 8, 0.3)',
                    backgroundColor: 'rgba(234, 179, 8, 0.08)'
                  }}
                >
                  <div className="text-xs text-yellow-600 dark:text-yellow-400 uppercase font-semibold">Needs Review</div>
                  <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">
                    {discoveryResult.counts.uncertain}
                  </div>
                </div>
              </div>

              {/* Ingestion Success / Error Banner */}
              {ingestResult && (
                <div
                  className="p-4 rounded-xl border flex flex-col gap-3"
                  style={{ backgroundColor: 'rgba(34, 197, 94, 0.08)', borderColor: 'rgba(34, 197, 94, 0.25)', color: 'var(--text-primary)' }}
                >
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={20} className="text-green-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-bold text-green-600 dark:text-green-400">
                        {ingestResult.message}
                      </div>
                      {ingestResult.batchId && (
                        <div className="text-xs text-muted mt-1 font-mono">
                          Batch ID: {ingestResult.batchId}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pl-7 pt-1">
                    <button
                      type="button"
                      onClick={() => navigate(`/entity/${selectedEntity?.entityId}/data`)}
                      className="btn btn-secondary text-xs"
                    >
                      View In Documents Table
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/entity/${selectedEntity?.entityId}/processing`)}
                      className="btn btn-primary text-xs flex items-center gap-1.5"
                    >
                      <span>Proceed to AI Processing</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              )}

              {ingestError && (
                <div
                  className="p-4 rounded-xl border text-sm flex items-start gap-2.5"
                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.25)', color: 'var(--text-primary)' }}
                >
                  <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                  <div>{ingestError}</div>
                </div>
              )}

              {/* FILTER TABS & SELECTION BAR */}
              <div className="card shadow-sm" style={{ borderColor: 'var(--border-color)', background: 'var(--surface-color)' }}>
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
                  {/* Category Filter Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveFilter('all')}
                      className={`btn btn-sm ${activeFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.75rem', height: '30px' }}
                    >
                      All ({discoveryResult.totalUnique})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveFilter('Relevant Opinion')}
                      className={`btn btn-sm ${activeFilter === 'Relevant Opinion' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{
                        fontSize: '0.75rem',
                        height: '30px',
                        backgroundColor: activeFilter === 'Relevant Opinion' ? '#16a34a' : undefined,
                        borderColor: activeFilter === 'Relevant Opinion' ? '#16a34a' : undefined
                      }}
                    >
                      Relevant Opinions ({discoveryResult.counts.relevantOpinion})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveFilter('News / Announcement')}
                      className={`btn btn-sm ${activeFilter === 'News / Announcement' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.75rem', height: '30px' }}
                    >
                      News ({discoveryResult.counts.newsAnnouncement})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveFilter('Irrelevant')}
                      className={`btn btn-sm ${activeFilter === 'Irrelevant' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.75rem', height: '30px' }}
                    >
                      Irrelevant ({discoveryResult.counts.irrelevant})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveFilter('Uncertain')}
                      className={`btn btn-sm ${activeFilter === 'Uncertain' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.75rem', height: '30px' }}
                    >
                      Review ({discoveryResult.counts.uncertain})
                    </button>
                  </div>

                  {/* Quick Select Actions & Bulk Push */}
                  <div className="flex items-center gap-3 text-xs flex-wrap">
                    <button
                      type="button"
                      onClick={handleSelectAllFiltered}
                      className="text-blue-500 hover:underline flex items-center gap-1 font-medium"
                    >
                      <CheckSquare size={14} />
                      <span>Select Filtered</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAllFiltered}
                      className="text-muted hover:underline flex items-center gap-1 font-medium"
                    >
                      <Square size={14} />
                      <span>Deselect Filtered</span>
                    </button>
                    <span className="font-semibold text-primary">
                      {selectedPostIds.size} of {discoveryResult.totalUnique} selected
                    </span>
                    <button
                      type="button"
                      onClick={handleIngestSelected}
                      disabled={isIngesting || selectedPostIds.size === 0}
                      className="btn font-semibold flex items-center gap-1.5 shadow-sm"
                      style={{
                        background: selectedPostIds.size > 0 ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' : '#94a3b8',
                        color: '#ffffff',
                        border: 'none',
                        padding: '0.42rem 0.9rem',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        cursor: selectedPostIds.size > 0 && !isIngesting ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {isIngesting ? (
                        <>
                          <Loader2 size={14} className="spin" />
                          <span>Pushing...</span>
                        </>
                      ) : (
                        <>
                          <Upload size={14} />
                          <span>Push Selected to Database ({selectedPostIds.size})</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Master-Detail Tip */}
                <div className="flex items-center gap-1.5 text-xs text-muted pt-3">
                  <Info size={14} />
                  <span>Click any post card to open its dedicated detail view, extract audience comments on demand, translate regional posts, or push it individually.</span>
                </div>

                {/* POSTS LIST */}
                {filteredPosts.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted">
                    No posts found under the &quot;{activeFilter}&quot; classification.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3.5 pt-4">
                    {filteredPosts.map((post) => {
                      const isChecked = selectedPostIds.has(post.id);
                      const badgeStyle = getClassificationBadgeStyle(post.classification);
                      const extractedCommentCount = post.commentsExtracted ? (post.comments || []).length : 0;
                      const selectedCommentCount = post.commentsExtracted
                        ? (selectedCommentKeysByPost[post.id] || []).length
                        : 0;
                      const isPushingThis = pushingPostId === post.id;
                      const isTranslated = post.translationStatus === 'translated' && Boolean(post.translatedText);

                      return (
                        <div
                          key={post.id}
                          className="p-4 rounded-xl border text-xs flex flex-col gap-2.5 transition-all"
                          style={{
                            backgroundColor: isChecked ? 'rgba(59, 130, 246, 0.03)' : 'var(--bg-color)',
                            borderColor: isChecked ? 'rgba(59, 130, 246, 0.4)' : 'var(--border-color)',
                            boxShadow: isChecked ? '0 1px 3px rgba(59, 130, 246, 0.1)' : 'none'
                          }}
                        >
                          {/* Post Header Row */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={post.alreadyIngested}
                                onChange={() => !post.alreadyIngested && handleToggleSelect(post.id)}
                                style={{
                                  width: '16px',
                                  height: '16px',
                                  cursor: post.alreadyIngested ? 'not-allowed' : 'pointer',
                                  marginTop: '2px'
                                }}
                                title={post.alreadyIngested ? 'Already ingested' : 'Select for bulk push'}
                              />
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => openPostDetail(post.id)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      padding: 0,
                                      textAlign: 'left',
                                      cursor: 'pointer',
                                    }}
                                    className="font-semibold text-sm hover:underline"
                                  >
                                    <span style={{ color: 'var(--text-primary)' }}>{post.author}</span>
                                  </button>
                                  {post.authorHeadline && (
                                    <span className="text-muted truncate max-w-sm hidden sm:inline" title={post.authorHeadline}>
                                      • {post.authorHeadline}
                                    </span>
                                  )}
                                  <span
                                    className="px-2 py-0.5 rounded text-[11px] font-bold"
                                    style={badgeStyle}
                                  >
                                    {post.classification}
                                  </span>
                                  {post.opinion_type && post.opinion_type !== 'None' && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-secondary border border-gray-200 dark:border-gray-700">
                                      {post.opinion_type}
                                    </span>
                                  )}
                                  {post.alreadyIngested && (
                                    <span
                                      className="px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1"
                                      style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--status-success)', border: '1px solid rgba(16, 185, 129, 0.35)' }}
                                    >
                                      <CheckCircle2 size={11} />
                                      <span>Ingested</span>
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                                  {post.publicationDate && (
                                    <span>{new Date(post.publicationDate).toLocaleDateString()}</span>
                                  )}
                                  <span>• Matched query: &quot;{post.matchedQuery}&quot;</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 text-muted">
                              {post.likesCount > 0 && <span>👍 {post.likesCount}</span>}
                              {post.commentsCount > 0 && <span>💬 {post.commentsCount}</span>}
                              <a
                                href={post.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:underline flex items-center gap-1 font-medium"
                              >
                                <span>LinkedIn</span>
                                <ExternalLink size={12} />
                              </a>
                            </div>
                          </div>

                          {/* AI Classification Reason Callout */}
                          <div
                            className="p-2.5 rounded-lg border text-xs leading-relaxed"
                            style={{
                              backgroundColor: post.classification === 'Relevant Opinion' ? 'rgba(34, 197, 94, 0.05)' : 'var(--surface-color)',
                              borderColor: post.classification === 'Relevant Opinion' ? 'rgba(34, 197, 94, 0.2)' : 'var(--border-color)',
                              color: 'var(--text-secondary)'
                            }}
                          >
                            <strong className="text-primary">Llama-3.1-8B Analysis:</strong> {post.reason}
                          </div>

                          {/* Clickable Post Preview */}
                          <div
                            onClick={() => openPostDetail(post.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openPostDetail(post.id); }}
                            className="p-3 rounded-lg text-xs leading-relaxed border cursor-pointer hover:border-blue-400 transition-colors"
                            style={{
                              backgroundColor: 'var(--surface-color)',
                              borderColor: 'var(--border-color)',
                              color: 'var(--text-primary)',
                              whiteSpace: 'pre-wrap'
                            }}
                            title="Click to inspect full post & extract comments"
                          >
                            {post.rawText.length > 320
                              ? `${post.rawText.slice(0, 320).trim()}...`
                              : post.rawText}
                          </div>

                          {/* Card Footer: Status Badges + Detail / Quick Push Actions */}
                          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {post.commentsExtracted && (
                                <span
                                  className="px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1"
                                  style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', color: 'var(--accent-blue)' }}
                                >
                                  <MessageSquare size={11} />
                                  <span>{extractedCommentCount} Comments Extracted ({selectedCommentCount} selected)</span>
                                </span>
                              )}
                              {isTranslated && (
                                <span
                                  className="px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1"
                                  style={{ backgroundColor: 'rgba(16, 185, 129, 0.14)', color: 'var(--status-success)' }}
                                >
                                  <CheckCircle2 size={11} />
                                  <span>English Translated</span>
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openPostDetail(post.id)}
                                className="btn btn-secondary text-xs py-1 px-2.5 flex items-center gap-1 font-semibold"
                              >
                                <span>Inspect Post</span>
                                <ArrowRight size={12} />
                              </button>
                              {!post.alreadyIngested && (
                                <button
                                  type="button"
                                  disabled={isPushingThis}
                                  onClick={() => handleIngestSinglePost(post)}
                                  className="btn btn-primary text-xs py-1 px-2.5 flex items-center gap-1 font-semibold"
                                >
                                  {isPushingThis ? (
                                    <Loader2 size={12} className="spin" />
                                  ) : (
                                    <Upload size={12} />
                                  )}
                                  <span>{isPushingThis ? 'Pushing...' : 'Push Post'}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Bottom Bulk Ingest Bar */}
                {filteredPosts.length > 0 && (
                  <div className="flex items-center justify-between flex-wrap gap-3 mt-6 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                    <span className="text-xs text-muted">
                      Adds selected un-ingested posts (along with any extracted comments &amp; cached translations) to MongoDB.
                    </span>
                    <button
                      type="button"
                      onClick={handleIngestSelected}
                      disabled={isIngesting || selectedPostIds.size === 0}
                      className="btn font-semibold flex items-center gap-2 shadow-sm"
                      style={{
                        background: selectedPostIds.size > 0 ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' : '#94a3b8',
                        color: '#ffffff',
                        border: 'none',
                        padding: '0.75rem 1.75rem',
                        borderRadius: '8px',
                        cursor: selectedPostIds.size > 0 && !isIngesting ? 'pointer' : 'not-allowed'
                      }}
                    >
                      {isIngesting ? (
                        <>
                          <Loader2 size={16} className="spin" />
                          <span>Pushing Selected to Database...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={16} />
                          <span>Push Selected / All to Database ({selectedPostIds.size} Posts)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LinkedInDiscovery;
