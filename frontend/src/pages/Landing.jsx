import { Link } from 'react-router-dom';
import { Database, Cpu, Search, ArrowRight } from 'lucide-react';

const Landing = () => {
  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', position: 'relative', overflow: 'hidden' }}>
      
      {/* Background Effect */}
      <div style={{
        position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)',
        width: '80vw', height: '80vw', background: 'radial-gradient(ellipse at top, rgba(99, 102, 241, 0.15) 0%, rgba(14, 15, 17, 0) 70%)',
        pointerEvents: 'none', zIndex: 0
      }}></div>

      <div className="container" style={{ position: 'relative', zIndex: 1, paddingTop: '6rem', paddingBottom: '6rem' }}>
        
        {/* Hero Section */}
        <div className="text-center" style={{ maxWidth: '800px', margin: '0 auto', marginBottom: '5rem' }}>
          <div className="badge badge-primary mb-6 text-sm" style={{ padding: '0.375rem 1rem' }}>
            Phase 1: Foundation & Data Collection
          </div>
          
          <h1 style={{ fontSize: '3.5rem', fontWeight: '700', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: '1.5rem', color: '#fff' }}>
            Narrative Intelligence Platform
          </h1>
          
          <p className="text-light" style={{ fontSize: '1.25rem', lineHeight: 1.6, marginBottom: '2.5rem' }}>
            Collect, organize, and analyze publicly available information and narratives related to NIT Raipur. 
            Build the foundation for future AI-driven insights.
          </p>
          
          <div className="flex items-center justify-center gap-4">
            <Link to="/register" className="btn btn-primary" style={{ padding: '0.875rem 2rem', fontSize: '1rem', borderRadius: 'var(--radius-lg)' }}>
              Get Started <ArrowRight size={18} />
            </Link>
            <Link to="/login" className="btn btn-secondary" style={{ padding: '0.875rem 2rem', fontSize: '1rem', borderRadius: 'var(--radius-lg)' }}>
              Login
            </Link>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-6" style={{ maxWidth: '1000px', margin: '0 auto' }}>
          
          <div className="card text-center" style={{ padding: '2rem' }}>
            <div style={{ backgroundColor: 'var(--surface-hover)', width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
              <Database size={24} className="text-accent" />
            </div>
            <h3 className="mb-2">Data Collection</h3>
            <p className="text-light text-sm mb-0">Aggregate news, social media, and forums into a centralized repository.</p>
          </div>

          <div className="card text-center" style={{ padding: '2rem' }}>
            <div style={{ backgroundColor: 'var(--surface-hover)', width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
              <Search size={24} className="text-accent" />
            </div>
            <h3 className="mb-2">Information Retrieval</h3>
            <p className="text-light text-sm mb-0">Browse and search through a structured archive of historical narratives.</p>
          </div>

          <div className="card text-center" style={{ padding: '2rem', borderStyle: 'dashed', backgroundColor: 'transparent' }}>
            <div style={{ backgroundColor: 'var(--surface-hover)', width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', opacity: 0.5 }}>
              <Cpu size={24} className="text-muted" />
            </div>
            <h3 className="mb-2 text-muted">NLP Processing</h3>
            <p className="text-muted text-sm mb-0">Future implementation of entity extraction, sentiment, and stance detection.</p>
          </div>

        </div>

      </div>
    </div>
  );
};

export default Landing;
