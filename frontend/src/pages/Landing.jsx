import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  Network,
  Hash,
  ShieldCheck,
  UserCircle2,
  Sparkles,
  ArrowRight,
  Bot,
  BarChart3,
} from 'lucide-react';

const adminLoginUrl = 'http://localhost:5174/login';

const Landing = () => {
  const [stats, setStats] = useState({ sources: 0, topics: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data } = await axios.get('/api/sources', { withCredentials: true });
        setStats((prev) => ({ ...prev, sources: data.length }));
      } catch (err) {
        console.error(err);
      }
    };
    fetchStats();
  }, []);

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
              <strong>{stats.sources || 24}</strong>
              <span>Sources</span>
            </div>
            <div className="mini-metric">
              <strong>{stats.topics || 18}</strong>
              <span>Topics</span>
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
            {stats.sources === 0 ? (
              <span className="text-secondary text-lg">No sources available</span>
            ) : (
              stats.sources
            )}
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
