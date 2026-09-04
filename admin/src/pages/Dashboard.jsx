import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { Database, Plus, Search, Cpu, FileText } from 'lucide-react';

const Dashboard = () => {
  const [stats, setStats] = useState(0);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data } = await api.get('/news');
        setStats(data.length);
      } catch (err) {
        console.error(err);
      }
    };
    fetchStats();
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="mb-2">Overview</h1>
        <p className="text-light">Monitor and manage narrative data collected for NIT Raipur.</p>
      </div>
      
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 mb-8">
        <div className="card">
          <div className="text-sm text-light mb-2 flex items-center gap-2">
            <Database size={16} /> Total Records
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.5rem', lineHeight: 1 }}>
            {stats}
          </div>
          <div className="text-xs text-muted">All collected source material</div>
        </div>
        
        {/* Placeholders for future data */}
        <div className="card" style={{ opacity: 0.7 }}>
          <div className="text-sm text-light mb-2 flex items-center gap-2">
            <FileText size={16} /> Sources
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.5rem', lineHeight: 1 }}>
            --
          </div>
          <div className="text-xs text-muted">Unique tracking sources</div>
        </div>

        <div className="card" style={{ opacity: 0.7 }}>
          <div className="text-sm text-light mb-2 flex items-center gap-2">
            <Search size={16} /> Added Recently
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.5rem', lineHeight: 1 }}>
            --
          </div>
          <div className="text-xs text-muted">In the last 7 days</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div>
          <h2 className="text-lg mb-4" style={{ fontSize: '1.25rem' }}>Quick Actions</h2>
          <div className="grid gap-4">
            <Link to="/news/add" className="card card-interactive flex items-center justify-between" style={{ padding: '1rem 1.5rem', display: 'flex' }}>
              <div>
                <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>Add New Data</div>
                <div className="text-xs text-light">Manually insert a source record</div>
              </div>
              <Plus className="text-muted" />
            </Link>
            
            <Link to="/news" className="card card-interactive flex items-center justify-between" style={{ padding: '1rem 1.5rem', display: 'flex' }}>
              <div>
                <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>Browse Data Library</div>
                <div className="text-xs text-light">View and manage collected narratives</div>
              </div>
              <Search className="text-muted" />
            </Link>
          </div>
        </div>

        {/* Processing Pipeline */}
        <div>
          <h2 className="text-lg mb-4" style={{ fontSize: '1.25rem' }}>Processing Pipeline</h2>
          <div className="card" style={{ borderStyle: 'dashed', backgroundColor: 'transparent' }}>
            <div className="flex items-center gap-3 mb-4">
              <div style={{ padding: '0.5rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)' }}>
                <Cpu size={20} className="text-accent" />
              </div>
              <div>
                <div style={{ fontWeight: '500' }}>Narrative Engine</div>
                <div className="text-xs text-light">Transform collected data into insights</div>
              </div>
            </div>
            
            <div className="flex-col gap-2 mb-6 text-sm text-light">
              <div className="flex items-center gap-2">• Entity Extraction</div>
              <div className="flex items-center gap-2">• Sentiment Analysis</div>
              <div className="flex items-center gap-2">• Stance Detection</div>
              <div className="flex items-center gap-2">• Topic Modeling</div>
            </div>

            <button className="btn btn-secondary" disabled style={{ width: '100%', opacity: 0.8 }}>
              Coming Soon
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
