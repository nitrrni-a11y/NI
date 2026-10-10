import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
  const { user, logout, loading } = useAuth();
  const location = useLocation();
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ni-admin-theme', theme);
  }, [theme]);

  const navItems = [
    { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { path: '/data', label: 'Data Management', icon: <Database size={18} /> },
    { path: '/data/add', label: 'Add Data', icon: <PlusCircle size={18} /> },
    { path: '/processing', label: 'AI Processing', icon: <Cpu size={18} /> },
    { path: '/narratives', label: 'Narratives', icon: <Network size={18} /> },
  ];

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  if (!user && !loading) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>NI Operations</h2>
          <div className="badge badge-error mt-2">ADMIN</div>
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
          <div className="header-actions">
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
