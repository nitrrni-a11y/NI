import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Activity, AlertCircle } from 'lucide-react';

const TrendGraph = ({ timeline = [], trend = 'Insufficient Data', title = 'Evidence Volume Over Time' }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // Normalize points and sort chronologically
  const points = (Array.isArray(timeline) ? timeline : [])
    .filter(p => p && p.date && p.claim_count !== undefined)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Trend Badge styling
  const getTrendBadge = (trendName) => {
    switch (trendName) {
      case 'Rising':
        return {
          icon: <TrendingUp size={14} className="text-emerald-500" />,
          label: 'Rising Trend',
          bg: 'rgba(16, 185, 129, 0.12)',
          color: '#10b981',
          border: 'rgba(16, 185, 129, 0.3)'
        };
      case 'Declining':
        return {
          icon: <TrendingDown size={14} className="text-rose-500" />,
          label: 'Declining Trend',
          bg: 'rgba(244, 63, 94, 0.12)',
          color: '#f43f5e',
          border: 'rgba(244, 63, 94, 0.3)'
        };
      case 'Stable':
        return {
          icon: <Activity size={14} className="text-blue-500" />,
          label: 'Stable Trend',
          bg: 'rgba(59, 130, 246, 0.12)',
          color: '#3b82f6',
          border: 'rgba(59, 130, 246, 0.3)'
        };
      default:
        return {
          icon: <AlertCircle size={14} className="text-amber-500" />,
          label: 'Insufficient Data',
          bg: 'rgba(245, 158, 11, 0.12)',
          color: '#f59e0b',
          border: 'rgba(245, 158, 11, 0.3)'
        };
    }
  };

  const badge = getTrendBadge(trend);

  // Insufficient data rendering
  if (points.length < 2) {
    return (
      <div
        className="p-4 rounded-xl border"
        style={{
          background: 'var(--surface-color-soft, #f9fafb)',
          borderColor: 'var(--border-color, #e5e7eb)'
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-primary m-0">{title}</h4>
          <span
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
          >
            {badge.icon} {badge.label}
          </span>
        </div>
        <div className="py-6 text-center text-xs text-secondary flex flex-col items-center justify-center gap-1">
          <AlertCircle size={24} className="text-amber-500 opacity-80 mb-1" />
          <p className="m-0 font-medium text-primary">Insufficient historical time points</p>
          <p className="m-0 text-muted">
            {points.length === 1
              ? `Only 1 observation date recorded (${points[0].date}: ${points[0].claim_count} claims). More historical records needed to determine trend.`
              : 'No dated claims available yet for this narrative.'}
          </p>
        </div>
      </div>
    );
  }

  // SVG Dimension calculations
  const width = 640;
  const height = 180;
  const paddingLeft = 45;
  const paddingRight = 25;
  const paddingTop = 25;
  const paddingBottom = 35;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const maxClaims = Math.max(...points.map(p => p.claim_count), 1);
  const minClaims = 0;
  const yTicks = [0, Math.ceil(maxClaims / 2), maxClaims];

  const getX = (index) => paddingLeft + (index / (points.length - 1)) * chartWidth;
  const getY = (val) => paddingTop + chartHeight - ((val - minClaims) / (maxClaims - minClaims || 1)) * chartHeight;

  // Build line path
  const linePath = points.reduce((acc, p, i) => {
    const x = getX(i);
    const y = getY(p.claim_count);
    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  // Build area fill path
  const firstX = getX(0);
  const lastX = getX(points.length - 1);
  const baselineY = getY(0);
  const areaPath = `${linePath} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;

  return (
    <div
      className="p-4 rounded-xl border relative"
      style={{
        background: 'var(--surface-color-soft, #f9fafb)',
        borderColor: 'var(--border-color, #e5e7eb)'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-primary m-0">{title}</h4>
          <span className="text-xs text-secondary">
            ({points.reduce((sum, p) => sum + p.claim_count, 0)} total claims across {points.length} periods)
          </span>
        </div>
        <span
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
        >
          {badge.icon} {badge.label}
        </span>
      </div>

      {/* SVG Canvas */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto"
          style={{ minWidth: '380px', display: 'block' }}
        >
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary-color, #3b82f6)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--primary-color, #3b82f6)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines and Y labels */}
          {yTicks.map((tick, i) => {
            const y = getY(tick);
            return (
              <g key={i}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="var(--border-color, #e5e7eb)"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--text-secondary, #6b7280)"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          <path d={areaPath} fill="url(#areaGradient)" />

          {/* Main Trend Line */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--primary-color, #3b82f6)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data Points */}
          {points.map((p, i) => {
            const cx = getX(i);
            const cy = getY(p.claim_count);
            const isHovered = hoveredIndex === i;

            return (
              <g
                key={i}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 6 : 4}
                  fill="var(--surface-color, #ffffff)"
                  stroke="var(--primary-color, #3b82f6)"
                  strokeWidth={isHovered ? 3 : 2}
                  style={{ transition: 'all 0.15s ease' }}
                />
                {/* Date label at bottom for selected ticks */}
                {(i === 0 || i === points.length - 1 || points.length <= 6) && (
                  <text
                    x={cx}
                    y={height - 12}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--text-secondary, #6b7280)"
                  >
                    {new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Floating Tooltip */}
      {hoveredIndex !== null && points[hoveredIndex] && (
        <div
          className="absolute z-10 px-3 py-2 rounded-lg shadow-lg text-xs border pointer-events-none"
          style={{
            bottom: '70px',
            left: `${Math.min(85, Math.max(15, (getX(hoveredIndex) / width) * 100))}%`,
            transform: 'translateX(-50%)',
            background: 'var(--surface-color, #1f2937)',
            color: 'var(--text-primary, #ffffff)',
            borderColor: 'var(--border-color, #374151)'
          }}
        >
          <div className="font-semibold">{points[hoveredIndex].date}</div>
          <div className="text-primary-color mt-0.5">
            <strong>{points[hoveredIndex].claim_count}</strong> supporting claims
          </div>
          {points[hoveredIndex].avg_sentiment !== undefined && (
            <div className="text-secondary mt-0.5">
              Sentiment score: {points[hoveredIndex].avg_sentiment > 0 ? '+' : ''}
              {points[hoveredIndex].avg_sentiment}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TrendGraph;

