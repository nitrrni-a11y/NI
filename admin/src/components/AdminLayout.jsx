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
  Settings,
  LogOut,
  MoonStar,
  SunMedium,
} from 'lucide-react';

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
    { path: 'data', label: 'Data Management', icon: <Database size={18} /> },
    { path: 'data/add', label: 'Add Data', icon: <PlusCircle size={18} /> },
    { path: 'processing', label: 'AI Processing', icon: <Cpu size={18} /> },
    { path: 'narratives', label: 'Narratives', icon: <Network size={18} /> },
  ];

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
          {navItems.map((item) => {
            // Check if current path ends with the item path to set active state
            // E.g. /entity/nit_raipur/dashboard ends with dashboard
            const isActive = location.pathname.split('/').pop() === item.path || (item.path === 'dashboard' && location.pathname.endsWith('/dashboard'));
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                {item.icon}
                <span>{item.label}</span>
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
                  {selectedEntity.domain} / <span style={{ color: 'var(--text-color)', fontWeight: 600 }}>{selectedEntity.name}</span>
                </span>
                <Link to="/" style={{ fontSize: '0.75rem', marginLeft: '0.5rem', color: 'var(--primary-color)', textDecoration: 'underline' }}>
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

