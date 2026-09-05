import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Database, Hash, Cpu, AlertCircle } from 'lucide-react';

const Dashboard = () => {
  const [stats, setStats] = useState({
    documents: 0,
    sources: 0,
    processing: null
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [docsRes, sourcesRes, procRes] = await Promise.all([
          axios.get('/api/news', { withCredentials: true }),
          axios.get('/api/sources', { withCredentials: true }),
          axios.get('/api/processing/status', { withCredentials: true })
        ]);
        
        setStats({
          documents: docsRes.data.total || docsRes.data.length || 0,
          sources: sourcesRes.data.length || 0,
          processing: procRes.data
        });
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) return <div className="p-4">Loading operational dashboard...</div>;

  return (
    <div>
      <div className="mb-6">
        <h1>Operations Dashboard</h1>
        <p className="text-secondary mt-1">System overview and intelligence pipeline status.</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-secondary">Total Documents</h3>
            <Database size={20} className="text-muted" />
          </div>
          <h2>{stats.documents}</h2>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-secondary">Active Sources</h3>
            <Hash size={20} className="text-muted" />
          </div>
          <h2>{stats.sources}</h2>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-secondary">Processing Status</h3>
            <Cpu size={20} className="text-muted" />
          </div>
          <h2>
            {stats.processing?.breakdown?.completed || 0} 
            <span className="text-secondary text-sm ml-2 font-normal">/ {stats.documents} Processed</span>
          </h2>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4 text-warning">
          <AlertCircle size={20} />
          <h3 className="text-warning m-0">AI Integration Pending</h3>
        </div>
        <p className="text-secondary leading-relaxed">
          The database and API routing architecture has been successfully overhauled to support the incoming Python AI service. 
          Currently, the AI pipeline is structurally mapped but disabled to ensure system stability during this phase. 
          All documents added will remain in the `not_processed` queue until integration is activated.
        </p>
      </div>
    </div>
  );
};

export default Dashboard;
