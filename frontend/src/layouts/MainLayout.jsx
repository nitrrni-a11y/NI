import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEntity } from '../context/EntityContext';
import {
  LayoutDashboard,
  Network,
  User,
  LogOut,
  MoonStar,
  SunMedium,
} from 'lucide-react';

const getInitialTheme = () => {
  const savedTheme = localStorage.getItem('ni-theme');
  if (savedTheme) return savedTheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const MainLayout = () => {
  const { user, logout } = useAuth();
  const { entities, selectedEntity, changeEntity, loading } = useEntity();
  const location = useLocation();
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ni-theme', theme);
  }, [theme]);

  const navItems = [
    { path: '/', label: 'Overview', icon: <LayoutDashboard size={18} /> },
    { path: '/narratives', label: 'Narratives', icon: <Network size={18} /> },
  ];

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Narrative Intelligence</h2>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        <header className="top-header">
          <div className="flex items-center gap-3 w-full justify-between">
            {selectedEntity && !loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  {selectedEntity.domain} / <span style={{ color: 'var(--text-color)', fontWeight: 600 }}>{selectedEntity.name}</span>
                </span>
                <Link to="/" style={{ fontSize: '0.75rem', marginLeft: '0.5rem', color: 'var(--primary-color)', textDecoration: 'underline' }}>
                  [Change Entity]
                </Link>
              </div>
            )}
            <div className="flex items-center gap-3 ml-auto">
              <button
                className="theme-toggle"
                onClick={toggleTheme}
                aria-label="Toggle dark mode"
                title="Toggle theme"
              >
                {theme === 'dark' ? <SunMedium size={18} /> : <MoonStar size={18} />}
              </button>

              {user ? (
                <>
                  <Link to="/profile" className="flex items-center gap-2 text-secondary">
                    <User size={18} />
                    <span>{user.name}</span>
                  </Link>
                  <button onClick={logout} className="btn btn-secondary ml-2 flex items-center gap-2">
                    <LogOut size={16} />
                    <span>Logout</span>
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="btn btn-secondary">Login</Link>
                  <Link to="/register" className="btn btn-primary ml-2">Register</Link>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="content-area">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
