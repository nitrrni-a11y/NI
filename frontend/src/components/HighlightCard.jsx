import React from 'react';
import {
  AlertTriangle,
  Sparkles,
  TrendingUp,
  FileText,
  Layers,
  ArrowRight,
  Bookmark,
} from 'lucide-react';
import { toArray } from '../services/api';

const PRIORITY_WEIGHT = {
  critical: 40,
  high: 30,
  medium: 15,
  low: 5,
  none: 0,
};

const SIGNIFICANCE_WEIGHT = {
  significant: 28,
  notable: 20,
  general: 10,
  none: 0,
};

export const normalizeTopicName = (topic, entityName = '') => {
  if (!topic || typeof topic !== 'string' || !topic.trim() || topic.trim().toLowerCase() === 'unknown') {
    return 'General';
  }
  let clean = topic.trim().replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();

  if (entityName && entityName.toLowerCase() !== 'unknown') {
    const esc = entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clean = clean.replace(new RegExp(`^${esc}\\s*[-–—:|/]?\\s*`, 'i'), '');
    clean = clean.replace(new RegExp(`\\s*[-–—:|/]?\\s*${esc}$`, 'i'), '');
  }

  clean = clean.replace(/^[\s\-–—:|/,.#'"]+|[\s\-–—:|/,.#'"]+$/g, '').trim();
  return clean || 'General';
};

export const getHighlightClassificationMeta = (narrative) => {
  const dir = narrative?.direction || 'neutral';
  const pri = narrative?.priority || 'none';
  const sig = narrative?.positiveSignificance || 'none';

  if (dir === 'negative') {
    if (pri === 'critical' || narrative?.isSecurityRisk || narrative?.severityLevel === 'critical') {
      return {
        label: 'Critical Escalation',
        borderColor: '#ef4444',
        badgeBg: 'rgba(239, 68, 68, 0.14)',
        badgeColor: '#ef4444',
        icon: AlertTriangle,
      };
    }
    if (pri === 'high') {
      return {
        label: 'High Concern',
        borderColor: '#f97316',
        badgeBg: 'rgba(249, 115, 22, 0.14)',
        badgeColor: '#ea580c',
        icon: AlertTriangle,
      };
    }
    return {
      label: 'Negative',
      borderColor: '#f59e0b',
      badgeBg: 'rgba(245, 158, 11, 0.14)',
      badgeColor: '#d97706',
      icon: AlertTriangle,
    };
  }

  if (dir === 'positive') {
    const label =
      sig === 'significant' ? 'Significant Positive' : sig === 'notable' ? 'Notable Positive' : 'Positive';
    return {
      label,
      borderColor: '#10b981',
      badgeBg: 'rgba(16, 185, 129, 0.14)',
      badgeColor: '#059669',
      icon: Sparkles,
    };
  }

  if (dir === 'mixed') {
    return {
      label: 'Mixed',
      borderColor: '#8b5cf6',
      badgeBg: 'rgba(139, 92, 246, 0.14)',
      badgeColor: '#7c3aed',
      icon: Layers,
    };
  }

  return {
    label: 'Neutral',
    borderColor: '#64748b',
    badgeBg: 'rgba(100, 116, 139, 0.14)',
    badgeColor: '#475569',
    icon: FileText,
  };
};

export const getHighlightConfidencePercent = (narrative) => {
  const raw = Number(narrative?.analysis?.strength ?? narrative?.confidence ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw <= 1 ? Math.min(100, Math.round(raw * 100)) : Math.min(100, Math.round(raw));
};

/**
 * Compute headline KPI summary counts across a list of narratives.
 */
export const computeNarrativeSummaryMetrics = (narratives) => {
  const safeList = Array.isArray(narratives) ? narratives : toArray(narratives, 'narratives');
  const eligible = safeList.filter(
    (n) => n && n.isEligibleForDisplay !== false && n.displayStatus !== 'candidate'
  );

  let positive = 0;
  let criticalEscalation = 0;
  let neutral = 0;

  eligible.forEach((n) => {
    const dir = n.direction || 'neutral';
    const pri = n.priority || 'none';
    if (dir === 'positive') {
      positive += 1;
    } else if (
      dir === 'negative' &&
      (pri === 'critical' || pri === 'high' || n.isSecurityRisk || n.severityLevel === 'critical')
    ) {
      criticalEscalation += 1;
    } else if (dir === 'neutral') {
      neutral += 1;
    }
  });

  return {
    total: eligible.length,
    positive,
    criticalEscalation,
    neutral,
  };
};

/**
 * Filter eligible narratives and rank top high-impact / dominant highlights.
 */
export const selectHighlightNarratives = (narratives, limit = 5) => {
  const safeList = Array.isArray(narratives) ? narratives : toArray(narratives, 'narratives');
  const eligible = safeList.filter(
    (n) => n && n.isEligibleForDisplay !== false && n.displayStatus !== 'candidate' && n.description
  );

  const scoreItem = (n) => {
    const priScore = PRIORITY_WEIGHT[n.priority] || 0;
    const sigScore = SIGNIFICANCE_WEIGHT[n.positiveSignificance] || 0;
    const rawStrength = Number(n.analysis?.strength ?? 0);
    const strengthNorm = rawStrength > 1 ? rawStrength / 100 : rawStrength;
    const claimBonus = Math.min(10, Number(n.analysis?.claim_count ?? 0));
    return Math.max(priScore, sigScore) + strengthNorm * 20 + claimBonus;
  };

  return [...eligible]
    .sort((a, b) => {
      const diff = scoreItem(b) - scoreItem(a);
      if (Math.abs(diff) > 0.001) return diff;
      const dateA = a.lastObservedAt ? new Date(a.lastObservedAt).getTime() : 0;
      const dateB = b.lastObservedAt ? new Date(b.lastObservedAt).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, limit);
};

const HighlightCard = ({ narrative, entityName = '', onSelect }) => {
  if (!narrative) return null;

  const meta = getHighlightClassificationMeta(narrative);
  const Icon = meta.icon;
  const confidencePct = getHighlightConfidencePercent(narrative);
  const claimCount =
    narrative.analysis?.claim_count ?? toArray(narrative.supportingEvidence, 'claim_ids').length ?? 0;
  const sourceCount =
    narrative.analysis?.source_count ?? toArray(narrative.supportingEvidence, 'sources').length ?? 0;
  const topicLabel = normalizeTopicName(narrative.topic, entityName);

  const handleActivate = () => {
    if (onSelect) onSelect(narrative);
  };

  return (
    <div
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect ? handleActivate : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleActivate();
              }
            }
          : undefined
      }
      className="card flex flex-col justify-between transition-all duration-150 hover:shadow-md"
      style={{
        borderLeft: `4px solid ${meta.borderColor}`,
        padding: '1.2rem 1.3rem',
        cursor: onSelect ? 'pointer' : 'default',
      }}
    >
      <div>
        {/* Topic + Sentiment + Date */}
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md"
              style={{
                background: 'var(--surface-color-soft)',
                color: 'var(--text-secondary)',
              }}
            >
              <Bookmark size={11} />
              <span>{topicLabel}</span>
            </span>

            <span
              className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md"
              style={{
                background: meta.badgeBg,
                color: meta.badgeColor,
              }}
            >
              <Icon size={11} />
              <span>{meta.label}</span>
            </span>
          </div>

          {confidencePct > 0 && (
            <span
              className="font-semibold px-2 py-0.5 rounded-full"
              style={{
                fontSize: '0.72rem',
                background: 'rgba(37, 99, 235, 0.1)',
                color: 'var(--accent-blue)',
              }}
              title="Narrative confidence & evidence strength"
            >
              {confidencePct}% confidence
            </span>
          )}
        </div>

        {/* Narrative Statement */}
        <div className="mb-3">
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded inline-block mb-1.5"
            style={{
              backgroundColor: 'rgba(37, 99, 235, 0.1)',
              color: 'var(--accent-blue)',
            }}
          >
            Narrative Statement
          </span>
          <h3
            className="text-sm font-semibold leading-snug m-0"
            style={{ color: 'var(--text-primary)' }}
          >
            &ldquo;{narrative.description}&rdquo;
          </h3>
        </div>
      </div>

      {/* Footer: Evidence Metrics & Link */}
      <div
        className="flex items-center justify-between flex-wrap gap-2 pt-3 mt-1 border-t text-xs"
        style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span>
            <strong>{claimCount}</strong> {claimCount === 1 ? 'claim' : 'claims'}
          </span>
          <span>•</span>
          <span>
            <strong>{sourceCount}</strong> {sourceCount === 1 ? 'source' : 'sources'}
          </span>
          {narrative.trend && narrative.trend !== 'Insufficient Data' && (
            <>
              <span>•</span>
              <span className="inline-flex items-center gap-1">
                <TrendingUp size={12} />
                {narrative.trend}
              </span>
            </>
          )}
        </div>

        {onSelect && (
          <span
            className="inline-flex items-center gap-1 font-semibold"
            style={{ color: 'var(--accent-blue)' }}
          >
            <span>Inspect</span>
            <ArrowRight size={13} />
          </span>
        )}
      </div>
    </div>
  );
};

export default HighlightCard;

