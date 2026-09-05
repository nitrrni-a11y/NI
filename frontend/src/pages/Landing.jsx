import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Network, Database, Hash, MessageSquare } from 'lucide-react';

const Landing = () => {
  const [stats, setStats] = useState({ sources: 0, topics: 0 });

  useEffect(() => {
    // In a real scenario, this would hit an aggregated /api/stats endpoint
    // For now, we mock it visually or fetch lightweight routes if possible.
    // Fetching sources count as a proxy for activity
    const fetchStats = async () => {
      try {
        const { data } = await axios.get('/api/sources', { withCredentials: true });
        setStats(prev => ({ ...prev, sources: data.length }));
      } catch (err) {
        console.error(err);
      }
    };
    fetchStats();
  }, []);

  return (
    <div>
      <div className="mb-4">
        <h1>Narrative Intelligence</h1>
        <p className="text-secondary mt-1">
          Advanced analysis of unstructured data to detect, track, and score emerging narratives.
        </p>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="card flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-secondary">Data Analyzed</h3>
            <Database size={20} className="text-muted" />
          </div>
          <h2>Live Stream</h2>
          <Link to="/news" className="text-accent-blue mt-2 inline-block">View Intelligence Data &rarr;</Link>
        </div>

        <div className="card flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-secondary">Detected Narratives</h3>
            <Network size={20} className="text-muted" />
          </div>
          <h2>AI Phase Pending</h2>
          <Link to="/narratives" className="text-accent-blue mt-2 inline-block">View Narratives &rarr;</Link>
        </div>

        <div className="card flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-secondary">Active Sources</h3>
            <Hash size={20} className="text-muted" />
          </div>
          <h2>{stats.sources || 'Scanning...'}</h2>
          <Link to="/sources" className="text-accent-blue mt-2 inline-block">View Sources &rarr;</Link>
        </div>
      </div>
      
      <div className="card">
        <h2>System Architecture</h2>
        <p className="text-secondary mt-2">
          The Narrative Intelligence platform processes raw inputs from diverse sources (News, Reddit, YouTube) and standardizes them. 
          In the upcoming AI integration phase, this data will pass through a 14-stage NLP pipeline to extract atomic claims, determine stances, and synthesize complex narratives via Large Language Models.
        </p>
      </div>
    </div>
  );
};

export default Landing;
