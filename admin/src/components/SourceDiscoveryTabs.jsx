import React from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Compass, PlaySquare } from 'lucide-react';

const LinkedinIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

const YouTubeIcon = ({ size = 18, color = '#ff0000' }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill={color} />
  </svg>
);

const SourceDiscoveryTabs = ({ activeTab = 'youtube' }) => {
  const navigate = useNavigate();
  const { entityId } = useParams();

  const handleSwitchTab = (tab) => {
    if (!entityId) return;
    if (tab === 'linkedin') {
      navigate(`/entity/${entityId}/discovery/linkedin`);
    } else if (tab === 'youtube') {
      navigate(`/entity/${entityId}/discovery/youtube`);
    }
  };

  return (
    <div style={{
      marginBottom: '1.5rem',
      background: 'var(--surface-color)',
      borderRadius: 'var(--radius-lg)',
      padding: '0.4rem',
      border: '1px solid var(--border-color)',
      display: 'inline-flex',
      gap: '0.5rem',
      width: '100%',
      maxWidth: '650px',
      boxShadow: 'var(--shadow-sm)'
    }}>
      {/* LinkedIn Tab */}
      <button
        type="button"
        onClick={() => handleSwitchTab('linkedin')}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.65rem',
          padding: '0.65rem 1rem',
          borderRadius: 'var(--radius-md)',
          border: 'none',
          cursor: 'pointer',
          background: activeTab === 'linkedin' ? 'var(--surface-color-strong)' : 'transparent',
          color: activeTab === 'linkedin' ? 'var(--text-primary)' : 'var(--text-muted)',
          boxShadow: activeTab === 'linkedin' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
          fontWeight: activeTab === 'linkedin' ? 600 : 500,
          transition: 'all 0.15s ease',
          outline: 'none'
        }}
      >
        <LinkedinIcon size={18} color={activeTab === 'linkedin' ? '#0a66c2' : 'currentColor'} />
        <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
          <div style={{ fontSize: '0.9rem' }}>LinkedIn Discovery</div>
          <div style={{ fontSize: '0.72rem', opacity: 0.8, fontWeight: 400 }}>Allam-2-7B SLM Opinions</div>
        </div>
      </button>

      {/* YouTube Tab */}
      <button
        type="button"
        onClick={() => handleSwitchTab('youtube')}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.65rem',
          padding: '0.65rem 1rem',
          borderRadius: 'var(--radius-md)',
          border: 'none',
          cursor: 'pointer',
          background: activeTab === 'youtube' ? 'var(--surface-color-strong)' : 'transparent',
          color: activeTab === 'youtube' ? 'var(--text-primary)' : 'var(--text-muted)',
          boxShadow: activeTab === 'youtube' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
          fontWeight: activeTab === 'youtube' ? 600 : 500,
          transition: 'all 0.15s ease',
          outline: 'none'
        }}
      >
        <YouTubeIcon size={18} color={activeTab === 'youtube' ? '#ef4444' : 'currentColor'} />
        <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
          <div style={{ fontSize: '0.9rem' }}>YouTube Review Discovery</div>
          <div style={{ fontSize: '0.72rem', opacity: 0.8, fontWeight: 400 }}>Apify Search & Transcripts</div>
        </div>
      </button>
    </div>
  );
};

export default SourceDiscoveryTabs;

