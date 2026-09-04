import { useContext } from 'react';
import { Link, useNavigate, Outlet, Navigate, useLocation } from 'react-router-dom';
import AuthContext from '../context/AuthContext';
import { LayoutDashboard, Database, Plus, Cpu, LogOut } from 'lucide-react';

const AdminLayout = () => {
  const { user, logout, loading } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" />;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Overview', path: '/', icon: <LayoutDashboard size={18} /> },
    { name: 'Data Library', path: '/news', icon: <Database size={18} /> },
    { name: 'Add Data', path: '/news/add', icon: <Plus size={18} /> },
  ];

  return (
    <div className="flex" style={{ minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{ width: '260px', backgroundColor: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 style={{ fontSize: '1rem', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>Narrative Intelligence</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>NIT Raipur</span>
        </div>
        
        <nav style={{ flexGrow: 1, padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                className="flex items-center gap-2"
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  backgroundColor: isActive ? 'var(--surface-hover)' : 'transparent',
                  fontWeight: isActive ? '500' : '400',
                  fontSize: '0.875rem',
                  transition: 'background-color var(--transition), color var(--transition)'
                }}
              >
                {item.icon}
                {item.name}
              </Link>
            );
          })}

          <div style={{ marginTop: '2rem', marginBottom: '0.5rem', paddingLeft: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Pipelines
          </div>
          <div className="flex items-center gap-2 text-muted" style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>
            <Cpu size={18} /> Processing <span className="badge" style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>Soon</span>
          </div>
        </nav>
        
        <div style={{ padding: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2 mb-4" style={{ padding: '0 0.5rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '600', fontSize: '0.875rem' }}>
              {user.name.charAt(0)}
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--text-primary)', lineHeight: '1.2' }}>{user.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Administrator</div>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--text-secondary)' }}>
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Topbar */}
        <header style={{ height: '60px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 2rem', backgroundColor: 'var(--bg-primary)' }}>
          <div className="text-light" style={{ fontSize: '0.875rem' }}>
            {location.pathname === '/' ? 'Overview' : location.pathname === '/news' ? 'Data Library' : location.pathname === '/news/add' ? 'Add Data' : 'Details'}
          </div>
        </header>

        {/* Page Content */}
        <div style={{ flexGrow: 1, overflowY: 'auto', padding: '2rem' }}>
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
