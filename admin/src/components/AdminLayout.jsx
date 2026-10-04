import React from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  Database, 
  PlusCircle, 
  Cpu, 
  Hash, 
  MessageSquare, 
  Network, 
  Settings, 
  LogOut 
} from 'lucide-react';

const AdminLayout = () => {
  const { user, logout, loading } = useAuth();
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { path: '/data', label: 'Data Management', icon: <Database size={18} /> },
    { path: '/data/add', label: 'Add Data', icon: <PlusCircle size={18} /> },
    { path: '/processing', label: 'AI Processing', icon: <Cpu size={18} /> },
    { path: '/narratives', label: 'Narratives', icon: <Network size={18} /> },
  ];

  if (!user && !loading) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
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

      {/* Main Content */}
      <main className="main-content">
        <header className="top-header">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-secondary">
              <Settings size={18} />
              <span>{user?.name || 'Administrator'}</span>
            </div>
            <button onClick={logout} className="btn btn-secondary ml-2 flex items-center gap-2">
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
