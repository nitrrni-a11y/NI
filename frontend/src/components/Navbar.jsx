import { useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthContext from '../context/AuthContext';
import { Search, User, LogOut } from 'lucide-react';

const Navbar = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, zIndex: 100 }}>
      <div className="container flex items-center justify-between" style={{ height: '64px' }}>
        <div className="flex items-center gap-6">
          <Link to="/" style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '24px', height: '24px', backgroundColor: 'var(--accent)', borderRadius: '4px' }}></div>
            Narrative Intelligence
          </Link>
          
          {user && (
            <div className="flex gap-4">
              <Link to="/news" className="nav-link" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Explore / Data</Link>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {!user ? (
            <>
              <Link to="/login" className="btn btn-ghost">Login</Link>
              <Link to="/register" className="btn btn-primary">Register</Link>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" style={{ padding: '0.5rem' }} title="Search (Coming Soon)">
                <Search size={18} />
              </button>
              <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--border)' }}></div>
              <div className="flex items-center gap-2 text-sm text-light">
                <User size={16} /> {user.name.split(' ')[0]}
              </div>
              <button onClick={handleLogout} className="btn btn-ghost" style={{ padding: '0.5rem' }} title="Logout">
                <LogOut size={18} />
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
