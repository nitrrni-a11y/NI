import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  Database, 
  MessageSquare, 
  Hash, 
  Network, 
  Search, 
  User, 
  LogOut 
} from 'lucide-react';

const MainLayout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Overview', icon: <LayoutDashboard size={18} /> },
    { path: '/news', label: 'Intelligence Data', icon: <Database size={18} /> },
    { path: '/sources', label: 'Sources', icon: <Hash size={18} /> },
    { path: '/topics', label: 'Topics', icon: <MessageSquare size={18} /> },
    { path: '/narratives', label: 'Narratives', icon: <Network size={18} /> },
    { path: '/search', label: 'Search', icon: <Search size={18} /> },
  ];

  return (
    <div className="app-container">
      {/* Sidebar */}
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

      {/* Main Content */}
      <main className="main-content">
        <header className="top-header">
          <div className="flex items-center gap-3">
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
        </header>

        <div className="content-area">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
