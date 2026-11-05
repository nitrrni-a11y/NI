import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEntity } from '../context/EntityContext';
import {
  LayoutDashboard,
  Database,
  PlusCircle,
  Cpu,
  Network,
  GraduationCap,
  Compass,
  Settings,
  LogOut,
  MoonStar,
  SunMedium,
} from 'lucide-react';

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

const YoutubeIcon = ({ size = 18, color = 'currentColor' }) => (
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

const getInitialTheme = () => {
  const savedTheme = localStorage.getItem('ni-admin-theme');
  if (savedTheme) return savedTheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const AdminLayout = () => {
  const { entityId } = useParams();
  const { user, logout, loading: authLoading } = useAuth();
  const { entities, selectedEntity, changeEntity, loading: entityLoading } = useEntity();
  const location = useLocation();
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ni-admin-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!entityLoading && entityId && selectedEntity?.entityId !== entityId) {
      changeEntity(entityId, false); // Assuming false prevents window reload, but wait
    }
  }, [entityId, selectedEntity, entityLoading, changeEntity]);

  const navItems = [
    { path: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { path: 'institution', label: 'NIT Raipur Web Scraping', icon: <GraduationCap size={18} /> },
    { path: 'data/add?tab=linkedin', key: 'linkedin-scraper', label: 'LinkedIn Post Scraper', icon: <LinkedinIcon size={18} color="#0a66c2" /> },
    { path: 'data/add?tab=youtube', key: 'youtube-extractor', label: 'YouTube Transcript & Comment Extractor', icon: <YoutubeIcon size={18} color="#ef4444" /> },
    { path: 'discovery/youtube', key: 'source-discovery', label: 'Source Discovery', icon: <Compass size={18} color="#0284c7" /> },
    { path: 'data', label: 'Data Management', icon: <Database size={18} /> },
    { path: 'data/add', key: 'add-data', label: 'Add Data', icon: <PlusCircle size={18} /> },
    { path: 'processing', label: 'AI Processing', icon: <Cpu size={18} /> },
    { path: 'narratives', label: 'Narratives', icon: <Network size={18} /> },
  ];

  const isItemActive = (item) => {
    const pathname = location.pathname;
    const search = location.search;

    if (item.key === 'linkedin-scraper') {
      return (pathname.endsWith('/data/add') && search.includes('tab=linkedin')) || pathname.includes('linkedin-post');
    }
    if (item.key === 'youtube-extractor') {
      return (pathname.endsWith('/data/add') && search.includes('tab=youtube')) || pathname.includes('youtube-extractor');
    }
    if (item.key === 'add-data') {
      return pathname.endsWith('/data/add') && !search.includes('tab=linkedin') && !search.includes('tab=youtube');
    }
    if (item.key === 'source-discovery') {
      return pathname.includes('/discovery') || pathname.includes('youtube-discovery') || pathname.includes('linkedin-discovery');
    }

    const cleanPath = item.path.split('?')[0];
    return pathname.split('/').pop() === cleanPath || (cleanPath === 'dashboard' && pathname.endsWith('/dashboard'));
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  if (!user && !authLoading) {
    return <Navigate to="/login" replace />;
  }

  if (entityLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>NI Operations</h2>
          <div className="badge badge-error mt-2">ADMIN</div>
        </div>

        <nav className="sidebar-nav">
          {navItems.filter(item => item.path !== 'institution' || selectedEntity?.entityId === 'ENT_45528e0f').map((item) => {
            const isActive = isItemActive(item);
            
            return (
              <Link
                key={item.key || item.path}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
                title={item.label}
              >
                {item.icon}
                <span style={{ lineHeight: 1.25 }}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="main-content">
        <header className="top-header">
          <div className="header-actions" style={{ width: '100%', justifyContent: 'flex-end' }}>
            {selectedEntity && (
              <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  {selectedEntity.domain} / <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedEntity.name}</span>
                </span>
                <Link to="/" style={{ fontSize: '0.75rem', marginLeft: '0.5rem', color: 'var(--accent-blue)', textDecoration: 'underline' }}>
                  [Change Entity]
                </Link>
              </div>
            )}
            
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
              title="Toggle theme"
            >
              {theme === 'dark' ? <SunMedium size={18} /> : <MoonStar size={18} />}
            </button>

            <div className="user-chip">
              <Settings size={18} />
              <span>{user?.name || 'Administrator'}</span>
            </div>
            <button onClick={logout} className="btn btn-secondary logout-btn">
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </div>
        </header>

        <div className="content-area">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;

