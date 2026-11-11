import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { fetchEntityNarratives } from '../services/api';
import {
  Network,
  Hash,
  ShieldCheck,
  UserCircle2,
  Sparkles,
  ArrowRight,
  Bot,
  BarChart3,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Overview from './Overview';
import HighlightCard, { selectHighlightNarratives } from '../components/HighlightCard';

const adminLoginUrl = import.meta.env?.VITE_ADMIN_URL || 'http://localhost:5174/login';

const Landing = () => {
  const { user, loading: authLoading } = useAuth();
  const [publicNarratives, setPublicNarratives] = useState([]);
  const [highlightsLoading, setHighlightsLoading] = useState(false);

  useEffect(() => {
    if (authLoading || user) return;
    let cancelled = false;
    setHighlightsLoading(true);
    fetchEntityNarratives(null)
      .then((list) => {
        if (!cancelled) setPublicNarratives(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setPublicNarratives([]);
      })
      .finally(() => {
        if (!cancelled) setHighlightsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const topHighlights = useMemo(
    () => selectHighlightNarratives(publicNarratives, 4),
    [publicNarratives]
  );

  if (authLoading) {
    return (
      <div className="p-8 flex items-center gap-2 text-secondary">
        <Loader2 size={18} className="animate-spin" />
        <span>Initializing workspace...</span>
      </div>
    );
  }

  // Logged-in consumer sees strictly the 3-step drill-down Overview (Domains -> Entities -> Entity Dashboard)
  if (user) {
    return <Overview />;
  }

  // Public Hero Landing View (Unauthenticated)
  return (
    <div className="landing-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="hero-badge">
            AI Narrative Intelligence
          </span>

          <h1>See the story behind the noise.</h1>
          <p>
            Transform scattered updates, claims, and source content into a clean,
            evidence-backed narrative map for smarter decisions.
          </p>

          <div className="hero-actions">
            <Link to="/login" className="btn btn-primary">
              Login as User
            </Link>
            <a href={adminLoginUrl} className="btn btn-secondary" target="_blank" rel="noreferrer">
              Login as Admin
            </a>
          </div>

          <div className="metric-strip">
            <div className="mini-metric">
              <strong>24+</strong>
              <span>Sources</span>
            </div>
            <div className="mini-metric">
              <strong>{publicNarratives.length || 18}</strong>
              <span>Narratives</span>
            </div>
            <div className="mini-metric">
              <strong>99.2%</strong>
              <span>Signal Reach</span>
            </div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="stack-card main-card">
            <div className="stack-header">
              <span className="dot green" />
              <span className="dot yellow" />
              <span className="dot purple" />
            </div>

            <div className="signal-panel">
              <div className="signal-row">
                <Bot size={18} />
                <span>AI extraction</span>
              </div>
              <div className="signal-row">
                <BarChart3 size={18} />
                <span>Claim clustering</span>
              </div>
              <div className="signal-row">
                <Network size={18} />
                <span>Narrative synthesis</span>
              </div>
            </div>
          </div>

          <div className="stack-card floating-card top-card">
            <span className="tiny-label">Live Narrative</span>
            <strong>Policy shift trend</strong>
            <small>+18.4% momentum</small>
          </div>

          <div className="stack-card floating-card bottom-card">
            <span className="tiny-label">Evidence score</span>
            <strong>87 / 100</strong>
          </div>
        </div>
      </section>

      <section className="portal-grid">
        <div className="portal-card user-card">
          <div className="portal-header">
            <UserCircle2 size={22} />
            <h3>User Portal</h3>
          </div>
          <p>
            Explore narratives, review evidence, and navigate your personal intelligence dashboard.
          </p>
          <Link to="/login" className="card-link">
            Login as User <ArrowRight size={16} />
          </Link>
        </div>

        <div className="portal-card admin-card">
          <div className="portal-header">
            <ShieldCheck size={22} />
            <h3>Admin Portal</h3>
          </div>
          <p>
            Manage incoming data, oversee AI processing, and track narrative evolution across sources.
          </p>
          <a href={adminLoginUrl} className="card-link" target="_blank" rel="noreferrer">
            Login as Admin <ArrowRight size={16} />
          </a>
        </div>
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2 m-0">
            <Sparkles size={18} style={{ color: 'var(--accent-blue)' }} />
            <span>Top Narrative Highlights</span>
          </h2>
          <Link to="/login" className="text-xs font-semibold" style={{ color: 'var(--accent-blue)' }}>
            Sign in for full workspace access &rarr;
          </Link>
        </div>

        {highlightsLoading ? (
          <div className="card p-6 text-center text-secondary text-sm">
            Loading highlights...
          </div>
        ) : topHighlights.length === 0 ? (
          <div className="card p-6 text-center text-secondary text-sm">
            Sign in to explore intelligence domains, entity dashboards, and narrative highlights.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {topHighlights.map((nar) => (
              <HighlightCard
                key={nar._id || nar.narrativeId}
                narrative={nar}
              />
            ))}
          </div>
        )}
      </section>

      <section className="insight-grid">
        <div className="card insight-card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-secondary">Detected Narratives</h3>
            <Network size={20} className="text-muted" />
          </div>
          <h2>Explore Intelligence</h2>
          <Link to="/narratives" className="text-accent-blue mt-2 inline-block">
            View Narratives &rarr;
          </Link>
        </div>

        <div className="card insight-card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-secondary">Active Sources</h3>
            <Hash size={20} className="text-muted" />
          </div>
          <h2>
            <span className="text-secondary text-lg">Sign in to view sources</span>
          </h2>
        </div>
      </section>

      <div className="card feature-card">
        <h2>System Architecture</h2>
        <p className="text-secondary mt-2">
          The Narrative Intelligence platform processes textual documents collected from multiple sources.
          Documents are cleaned, analyzed, enriched, grouped into related claims and narratives, and used
          to generate evidence-based intelligence and recommendations.
        </p>
      </div>
    </div>
  );
};

export default Landing;
