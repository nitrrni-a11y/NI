import React, { useEffect, useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEntity } from '../context/EntityContext';
import { MoonStar, SunMedium, Settings, LogOut } from 'lucide-react';

const getInitialTheme = () => {
  const savedTheme = localStorage.getItem('ni-admin-theme');
  if (savedTheme) return savedTheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const GlobalLayout = () => {
  const { user, logout, loading: authLoading } = useAuth();
  const { loading: entityLoading } = useEntity();
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ni-admin-theme', theme);
  }, [theme]);

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
    <div className="app-container" style={{ gridTemplateColumns: '1fr' }}>
      <main className="main-content">
        <header className="top-header">
          <div className="header-actions" style={{ width: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-color)' }}>Narrative Intelligence</h2>
              <div className="badge badge-error ml-2">ADMIN</div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
          </div>
        </header>

        <div className="content-area" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default GlobalLayout;
