import React, { useEffect, useState } from 'react';
import {
  Database, 
  Hash, 
  Cpu, 
  AlertCircle, 
  AlertTriangle, 
  Sparkles, 
  TrendingUp, 
  Layers, 
  FileText, 
  ChevronRight, 
  X,
  Bookmark,
  Lightbulb
} from 'lucide-react';
import { useEntity } from '../context/EntityContext';
import TrendGraph from '../components/TrendGraph';
import api, { toArray } from '../services/api';

const normalizeTopic = (topic, entityName = '') => {
  if (!topic || typeof topic !== 'string' || !topic.trim() || topic.trim().toLowerCase() === 'unknown') {
    return 'General';
  }
  let clean = topic.trim();
  clean = clean.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();

  if (entityName && entityName.toLowerCase() !== 'unknown') {
    const esc = entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clean = clean.replace(new RegExp(`^${esc}\\s*[-–—:|/]?\\s*`, 'i'), '');
    clean = clean.replace(new RegExp(`\\s*[-–—:|/]?\\s*${esc}$`, 'i'), '');
  }

  clean = clean.replace(/^[\s\-–—:|/,.#'"]+|[\s\-–—:|/,.#'"]+$/g, '').trim();
  return clean || 'General';
};

const getClassificationMeta = (item) => {
  const dir = item?.direction || 'neutral';
  const pri = item?.priority || 'none';
  const sig = item?.positiveSignificance || 'none';

  if (dir === 'negative') {
    if (pri === 'critical' || item?.isSecurityRisk || item?.severityLevel === 'critical') {
      return {
        label: 'Critical Priority',
        badgeClass: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-900',
        borderColor: '#dc2626',
        color: '#dc2626',
        category: 'negative'
      };
    }
    if (pri === 'high' || item?.severityLevel === 'high') {
      return {
        label: 'High Priority',
        badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200 dark:border-orange-900',
        borderColor: '#ea580c',
        color: '#ea580c',
        category: 'negative'
      };
    }
    if (pri === 'medium') {
      return {
        label: 'Medium Priority',
        badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-900',
        borderColor: '#d97706',
        color: '#d97706',
        category: 'negative'
      };
    }
    return {
      label: 'Low Priority',
      badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
      borderColor: '#64748b',
      color: '#64748b',
      category: 'negative'
    };
  }

  if (dir === 'positive') {
    if (sig === 'significant') {
      return {
        label: 'Significant Highlight',
        badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold',
        borderColor: '#059669',
        color: '#059669',
        category: 'positive'
      };
    }
    if (sig === 'notable') {
      return {
        label: 'Notable Highlight',
        badgeClass: 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-semibold',
        borderColor: '#0d9488',
        color: '#0d9488',
        category: 'positive'
      };
    }
    return {
      label: 'Positive Feedback',
      badgeClass: 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-300 border border-green-200 dark:border-green-800',
      borderColor: '#10b981',
      color: '#10b981',
      category: 'positive'
    };
  }

  return {
    label: 'Neutral Observation',
    badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
    borderColor: '#94a3b8',
    color: '#64748b',
    category: 'neutral'
  };
};

const Dashboard = () => {
  const { selectedEntity } = useEntity();
  const [stats, setStats] = useState({
    documents: 0,
    sources: 0,
    processing: null
  });
  const [attentionData, setAttentionData] = useState({
    negative: [],
    positive: []
  });
  const [selectedNarrative, setSelectedNarrative] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!selectedEntity) return;
      try {
        const [docsRes, sourcesRes, procRes, attentionRes] = await Promise.all([
          api.get(`/documents?entity_id=${selectedEntity.entityId}`),
          api.get(`/sources?entity_id=${selectedEntity.entityId}`),
          api.get(`/processing/status?entity_id=${selectedEntity.entityId}`),
          api.get(`/admin/dashboard/attention-narratives?entity_id=${selectedEntity.entityId}`).catch(() => ({ data: { negative: [], positive: [] } }))
        ]);

        const docsList = toArray(docsRes.data, 'documents');
        const sourcesList = toArray(sourcesRes.data, 'sources');
        setStats({
          documents: docsRes.data?.total ?? docsList.length ?? 0,
          sources: sourcesList.length,
          processing: procRes.data
        });
        setAttentionData({
          negative: toArray(attentionRes.data?.negative),
          positive: toArray(attentionRes.data?.positive)
        });
        setLoading(false);
      } catch (err) {
        console.error('Dashboard load error:', err);
        setLoading(false);
      }
    };
    fetchStats();
  }, [selectedEntity]);

  // Lock background scroll and listen for Escape key on modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setSelectedNarrative(null);
    };
    if (selectedNarrative) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedNarrative]);

  if (loading) return <div className="p-4">Loading operational dashboard...</div>;
  if (!selectedEntity) return <div className="p-4">Please select a workspace.</div>;

  return (
    <div className="pb-12">
      {/* Header */}
      <div className="flex flex-col mb-6">
        <h1 className="page-title">Operations Dashboard</h1>
        <p className="page-subtitle">
          System overview and intelligence highlights for {selectedEntity.name || selectedEntity.entityId}.
        </p>
      </div>

      {/* 3 Metric Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-6">
        <div className="metric-card-horizontal">
          <div className="metric-icon-wrap bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
            <Database size={20} />
          </div>
          <div className="metric-body">
            <span className="metric-label">Total Documents</span>
            <div className="metric-num-row">
              <span className="metric-num">{stats.documents}</span>
              <span className="metric-sub">records</span>
            </div>
          </div>
        </div>

        <div className="metric-card-horizontal">
          <div className="metric-icon-wrap bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
            <Hash size={20} />
          </div>
          <div className="metric-body">
            <span className="metric-label">Active Sources</span>
            <div className="metric-num-row">
              <span className="metric-num">{stats.sources}</span>
              <span className="metric-sub">channels</span>
            </div>
          </div>
        </div>

        <div className="metric-card-horizontal">
          <div className="metric-icon-wrap bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <Cpu size={20} />
          </div>
          <div className="metric-body">
            <span className="metric-label">Processing Status</span>
            <div className="metric-num-row">
              <span className="metric-num text-emerald-600 dark:text-emerald-400">
                {stats.processing?.breakdown?.completed || 0}
              </span>
              <span className="metric-sub">/ {stats.documents} Processed</span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1: Negative Narratives Requiring Attention */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3 border-b pb-2.5" style={{ borderColor: 'var(--border-color)' }}>
          <div>
            <h2 className="text-base font-bold flex items-center gap-2 m-0" style={{ color: 'var(--text-primary)' }}>
              <AlertTriangle size={18} className="text-amber-500" /> Negative Narratives Requiring Attention
            </h2>
            <p className="text-secondary text-xs m-0 mt-0.5">
              High-priority institutional issues, safety concerns, and recurring student grievances requiring executive review.
            </p>
          </div>
          <span className="badge text-xs px-2.5 py-0.5 rounded-full" style={{ background: 'var(--surface-color-soft)', color: 'var(--text-secondary)' }}>
            {attentionData.negative.length} {attentionData.negative.length === 1 ? 'item' : 'items'}
          </span>
        </div>

        {attentionData.negative.length === 0 ? (
          <div className="p-6 rounded-2xl border text-center text-secondary text-sm" style={{ background: 'var(--surface-color-soft)', borderColor: 'var(--border-color)' }}>
            <p className="m-0">No critical or high-priority negative narratives detected for this workspace.</p>
            <p className="text-xs text-muted mt-1 m-0">Standard feedback and candidate signals are monitored in the Narratives intelligence module.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {attentionData.negative.map(nar => {
              const meta = getClassificationMeta(nar);
              return (
                <div
                  key={nar._id}
                  tabIndex={0}
                  role="button"
                  aria-label={`View narrative: ${nar.description}`}
                  onClick={() => setSelectedNarrative(nar)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedNarrative(nar);
                    }
                  }}
                  className="card shadow-sm border flex flex-col justify-between cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{
                    borderLeft: `4px solid ${meta.borderColor}`,
                    background: 'var(--surface-color)',
                    padding: '1.15rem 1.25rem',
                    userSelect: 'text'
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: 'var(--surface-color-soft)', color: 'var(--text-secondary)' }}>
                          {normalizeTopic(nar.topic, selectedEntity.name)}
                        </span>
                        <span className={`badge text-xs px-2 py-0.5 rounded-md font-semibold ${meta.badgeClass}`}>
                          {meta.label}
                        </span>
                      </div>
                      <span className="text-secondary text-xs whitespace-nowrap">
                        {nar.lastObservedAt ? new Date(nar.lastObservedAt).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>

                    <div className="mb-2">
                      <span 
                        className="text-[9px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 rounded inline-block mb-1"
                        style={{
                          backgroundColor: 'rgba(37, 99, 235, 0.1)',
                          color: 'var(--accent-blue, #2563eb)',
                          letterSpacing: '0.06em'
                        }}
                      >
                        Narrative Statement
                      </span>
                      <h3 className="text-sm font-bold leading-snug m-0" style={{ color: 'var(--text-primary)' }}>
                        "{nar.description}"
                      </h3>
                    </div>

                    {nar.recommendation ? (
                      <div
                        className="rounded-lg p-2 mb-2 border text-xs"
                        style={{
                          background: 'rgba(16, 185, 129, 0.05)',
                          borderColor: 'rgba(16, 185, 129, 0.25)',
                          borderLeft: '3px solid #10b981'
                        }}
                      >
                        <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold mb-0.5 text-[10px] uppercase tracking-wider">
                          <Lightbulb size={11} className="shrink-0" />
                          <span>Actionable Recommendation</span>
                        </div>
                        <p 
                          className="text-secondary text-xs m-0 italic leading-relaxed font-medium"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}
                        >
                          "{nar.recommendation}"
                        </p>
                      </div>
                    ) : (
                      <div 
                        className="rounded-lg p-2 mb-2 border text-xs text-muted italic"
                        style={{
                          background: 'var(--surface-color-soft)',
                          borderColor: 'var(--border-color)'
                        }}
                      >
                        No specific recommendation recorded.
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-2.5 mt-2 flex items-center justify-between text-xs text-secondary font-medium" style={{ borderColor: 'var(--border-color)' }}>
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center gap-1" title="Claims">
                        <Layers size={12} /> {nar.analysis?.claim_count || 0}
                      </span>
                      <span className="flex items-center gap-1" title="Sources">
                        <FileText size={12} /> {nar.analysis?.source_count || 0}
                      </span>
                      <span className="flex items-center gap-1" title="Trend">
                        <TrendingUp size={12} /> {nar.trend || nar.analysis?.trend || 'Stable'}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: meta.color }}>
                      Details <ChevronRight size={13} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: Positive Institutional Highlights */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3 border-b pb-2.5" style={{ borderColor: 'var(--border-color)' }}>
          <div>
            <h2 className="text-base font-bold flex items-center gap-2 m-0" style={{ color: 'var(--text-primary)' }}>
              <Sparkles size={18} className="text-emerald-500" /> Positive Institutional Highlights
            </h2>
            <p className="text-secondary text-xs m-0 mt-0.5">
              Standout institutional achievements, record placements, and core strengths identified across student feedback.
            </p>
          </div>
          <span className="badge text-xs px-2.5 py-0.5 rounded-full" style={{ background: 'var(--surface-color-soft)', color: 'var(--text-secondary)' }}>
            {attentionData.positive.length} {attentionData.positive.length === 1 ? 'highlight' : 'highlights'}
          </span>
        </div>

        {attentionData.positive.length === 0 ? (
          <div className="p-6 rounded-2xl border text-center text-secondary text-sm" style={{ background: 'var(--surface-color-soft)', borderColor: 'var(--border-color)' }}>
            <p className="m-0">No major positive highlights recorded yet for this workspace.</p>
            <p className="text-xs text-muted mt-1 m-0">Positive achievements will appear here as corroborating evidence is processed.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {attentionData.positive.map(nar => {
              const meta = getClassificationMeta(nar);
              return (
                <div
                  key={nar._id}
                  tabIndex={0}
                  role="button"
                  aria-label={`View highlight: ${nar.description}`}
                  onClick={() => setSelectedNarrative(nar)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedNarrative(nar);
                    }
                  }}
                  className="card shadow-sm border flex flex-col justify-between cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  style={{
                    borderLeft: `4px solid ${meta.borderColor}`,
                    background: 'var(--surface-color)',
                    padding: '1.15rem 1.25rem',
                    userSelect: 'text'
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: 'var(--surface-color-soft)', color: 'var(--text-secondary)' }}>
                          {normalizeTopic(nar.topic, selectedEntity.name)}
                        </span>
                        <span className={`badge text-xs px-2 py-0.5 rounded-md font-semibold ${meta.badgeClass}`}>
                          {meta.label}
                        </span>
                      </div>
                      <span className="text-secondary text-xs whitespace-nowrap">
                        {nar.lastObservedAt ? new Date(nar.lastObservedAt).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>

                    <div className="mb-2">
                      <span 
                        className="text-[9px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 rounded inline-block mb-1"
                        style={{
                          backgroundColor: 'rgba(37, 99, 235, 0.1)',
                          color: 'var(--accent-blue, #2563eb)',
                          letterSpacing: '0.06em'
                        }}
                      >
                        Narrative Statement
                      </span>
                      <h3 className="text-sm font-bold leading-snug m-0" style={{ color: 'var(--text-primary)' }}>
                        "{nar.description}"
                      </h3>
                    </div>

                    {nar.recommendation ? (
                      <div
                        className="rounded-lg p-2 mb-2 border text-xs"
                        style={{
                          background: 'rgba(16, 185, 129, 0.05)',
                          borderColor: 'rgba(16, 185, 129, 0.25)',
                          borderLeft: '3px solid #10b981'
                        }}
                      >
                        <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold mb-0.5 text-[10px] uppercase tracking-wider">
                          <Lightbulb size={11} className="shrink-0" />
                          <span>Actionable Recommendation</span>
                        </div>
                        <p 
                          className="text-secondary text-xs m-0 italic leading-relaxed font-medium"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}
                        >
                          "{nar.recommendation}"
                        </p>
                      </div>
                    ) : (
                      <div 
                        className="rounded-lg p-2 mb-2 border text-xs text-muted italic"
                        style={{
                          background: 'var(--surface-color-soft)',
                          borderColor: 'var(--border-color)'
                        }}
                      >
                        No specific recommendation recorded.
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-2.5 mt-2 flex items-center justify-between text-xs text-secondary font-medium" style={{ borderColor: 'var(--border-color)' }}>
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center gap-1" title="Claims">
                        <Layers size={12} /> {nar.analysis?.claim_count || 0}
                      </span>
                      <span className="flex items-center gap-1" title="Sources">
                        <FileText size={12} /> {nar.analysis?.source_count || 0}
                      </span>
                      <span className="flex items-center gap-1" title="Trend">
                        <TrendingUp size={12} /> {nar.trend || nar.analysis?.trend || 'Stable'}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: meta.color }}>
                      Details <ChevronRight size={13} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Pipeline Status Banner */}
      <div 
        className="rounded-2xl border p-5 shadow-sm"
        style={{ 
          background: 'var(--surface-color-strong, #ffffff)', 
          borderColor: 'var(--border-color)',
          borderLeft: '4px solid #10b981'
        }}
      >
        <div className="flex items-center gap-2.5 mb-2">
          <Cpu size={20} className="text-emerald-600 dark:text-emerald-400" />
          <h3 className="text-sm font-bold m-0 text-emerald-600 dark:text-emerald-400">AI Pipeline Active</h3>
        </div>
        <p className="text-secondary text-sm leading-relaxed m-0">
          The Narrative Intelligence pipeline is fully integrated and operational. Documents are processed to extract claims, identify related narratives, analyze trends, and generate evidence-based intelligence.
        </p>
      </div>

      {/* Complete Narrative Details Modal (Interactive on entire card click) */}
      {selectedNarrative && (() => {
        const modalMeta = getClassificationMeta(selectedNarrative);
        return (
          <div
            role="dialog"
            aria-modal="true"
            className="modal-backdrop-solid"
            onClick={() => setSelectedNarrative(null)}
          >
            <div
              className="modal-dialog-solid"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 1 & 2. Modal Header - Topic, Severity, Status & Clearly Highlighted Narrative Statement */}
              <div className="modal-header-solid flex-col items-stretch gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span 
                      className="px-2.5 py-1 rounded-md text-xs font-semibold"
                      style={{ background: 'var(--surface-color-soft)', color: 'var(--text-secondary)' }}
                    >
                      {normalizeTopic(selectedNarrative.topic, selectedEntity?.name)}
                    </span>
                    <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${modalMeta.badgeClass}`}>
                      {modalMeta.label}
                    </span>
                    {selectedNarrative.displayStatus === 'candidate' && (
                      <span
                        className="px-2.5 py-1 rounded-md text-xs font-semibold"
                        style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#b45309' }}
                      >
                        Candidate Observation
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:text-primary transition-colors cursor-pointer border-none bg-transparent hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
                    onClick={() => setSelectedNarrative(null)}
                    aria-label="Close details"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Visually Distinct Narrative Statement Container */}
                <div 
                  className="rounded-xl p-3.5 sm:p-4 border shadow-xs"
                  style={{
                    background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.07) 0%, rgba(99, 102, 241, 0.04) 100%)',
                    borderColor: 'rgba(59, 130, 246, 0.3)',
                    borderLeft: '4px solid var(--accent-blue, #2563eb)'
                  }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span 
                      className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded inline-block"
                      style={{
                        backgroundColor: 'rgba(37, 99, 235, 0.15)',
                        color: 'var(--accent-blue, #2563eb)',
                        letterSpacing: '0.08em'
                      }}
                    >
                      Narrative Statement
                    </span>
                  </div>
                  <p 
                    className="text-base sm:text-lg font-bold leading-snug sm:leading-relaxed m-0"
                    style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}
                  >
                    "{selectedNarrative.description}"
                  </p>
                </div>
              </div>

              {/* Modal Body */}
              <div className="modal-body-scrollable">
                {/* Classification Rationale */}
                {selectedNarrative.classificationReason && (
                  <div 
                    className="p-3.5 rounded-xl border text-xs" 
                    style={{ 
                      background: 'var(--surface-color-soft)', 
                      borderColor: 'var(--border-color)', 
                      color: 'var(--text-secondary)' 
                    }}
                  >
                    <div className="flex items-center gap-1.5 font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                      <span>Classification Context & Impact</span>
                    </div>
                    <p className="m-0 leading-relaxed">{selectedNarrative.classificationReason}</p>
                    {selectedNarrative.impactIndicators && selectedNarrative.impactIndicators.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {selectedNarrative.impactIndicators.map((ind, idx) => (
                          <span 
                            key={idx} 
                            className="px-2 py-0.5 rounded-full text-xs font-mono font-medium"
                            style={{ 
                              background: 'var(--surface-color-strong)', 
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-secondary)'
                            }}
                          >
                            #{ind}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 4 Metrics Grid */}
                <div
                  className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl border shadow-sm"
                  style={{ 
                    background: 'var(--surface-color-soft)', 
                    borderColor: 'var(--border-color)' 
                  }}
                >
                  <div className="flex flex-col justify-center">
                    <span className="text-secondary text-xs uppercase tracking-wider font-semibold block mb-1">Claim Count</span>
                    <strong className="text-xl font-extrabold" style={{ color: 'var(--text-primary)' }}>
                      {selectedNarrative.analysis?.claim_count || 0}
                    </strong>
                  </div>
                  <div className="flex flex-col justify-center">
                    <span className="text-secondary text-xs uppercase tracking-wider font-semibold block mb-1">Source Count</span>
                    <strong className="text-xl font-extrabold" style={{ color: 'var(--text-primary)' }}>
                      {selectedNarrative.analysis?.source_count || (selectedNarrative.supportingEvidence?.sources?.length || 0)}
                    </strong>
                  </div>
                  <div className="flex flex-col justify-center">
                    <span className="text-secondary text-xs uppercase tracking-wider font-semibold block mb-1">Trend</span>
                    <div>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full font-semibold text-xs ${
                        (selectedNarrative.trend || selectedNarrative.analysis?.trend) === 'Rising' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' :
                        (selectedNarrative.trend || selectedNarrative.analysis?.trend) === 'Declining' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' :
                        (selectedNarrative.trend || selectedNarrative.analysis?.trend) === 'Stable' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                      }`}>
                        {selectedNarrative.trend || selectedNarrative.analysis?.trend || 'Insufficient Data'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col justify-center">
                    <span className="text-secondary text-xs uppercase tracking-wider font-semibold block mb-1">Last Observed</span>
                    <strong className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {selectedNarrative.lastObservedAt ? new Date(selectedNarrative.lastObservedAt).toLocaleDateString() : 'N/A'}
                    </strong>
                  </div>
                </div>

                {/* TrendGraph */}
                <div 
                  className="rounded-xl border overflow-hidden p-1"
                  style={{ 
                    background: 'var(--surface-color-strong)', 
                    borderColor: 'var(--border-color)' 
                  }}
                >
                  <TrendGraph
                    timeline={selectedNarrative.timeline || selectedNarrative.analysis?.temporal_information?.timeline || []}
                    trend={selectedNarrative.trend || selectedNarrative.analysis?.trend || 'Insufficient Data'}
                    title="Evidence Velocity & Temporal Activity"
                  />
                </div>

                {/* 5. Actionable Recommendation (Prominently Placed Above Intelligence Brief) */}
                {selectedNarrative.recommendation && (
                  <div
                    className="p-4 sm:p-4.5 rounded-xl border shadow-xs"
                    style={{
                      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.03) 100%)',
                      borderColor: 'rgba(16, 185, 129, 0.35)',
                      borderLeft: '4px solid #10b981'
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div 
                        style={{ 
                          width: '26px', 
                          height: '26px', 
                          borderRadius: '6px', 
                          backgroundColor: 'rgba(16, 185, 129, 0.18)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          color: '#059669' 
                        }}
                      >
                        <Lightbulb size={15} />
                      </div>
                      <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-400 m-0">
                        Actionable Recommendation
                      </h4>
                    </div>
                    <p 
                      className="italic leading-relaxed m-0 font-medium"
                      style={{ 
                        fontSize: '0.9375rem', 
                        lineHeight: '1.6', 
                        color: 'var(--text-primary)' 
                      }}
                    >
                      "{selectedNarrative.recommendation}"
                    </p>
                  </div>
                )}

                {/* 6. Executive Intelligence Brief */}
                <div 
                  className="p-4 rounded-xl border border-l-4"
                  style={{ 
                    background: 'var(--surface-color-soft)',
                    borderColor: 'var(--border-color)',
                    borderLeftColor: 'var(--accent-blue)'
                  }}
                >
                  <h4 className="font-bold text-sm mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    Executive Intelligence Brief
                  </h4>
                  <p className="text-secondary leading-relaxed whitespace-pre-wrap m-0 text-sm">
                    {selectedNarrative.intelligence || 'No detailed intelligence summary available for this narrative.'}
                  </p>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="modal-footer-solid">
                <button 
                  type="button"
                  className="btn btn-secondary px-5" 
                  onClick={() => setSelectedNarrative(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Dashboard;

