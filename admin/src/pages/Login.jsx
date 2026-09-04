import { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthContext from '../context/AuthContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, user } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to login');
    }
  };

  return (
    <div className="flex items-center justify-center" style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Subtle radial gradient background */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '60vw', height: '60vw', background: 'radial-gradient(circle, rgba(99, 102, 241, 0.05) 0%, rgba(14, 15, 17, 0) 70%)',
        pointerEvents: 'none', zIndex: 0
      }}></div>
      
      <div className="card" style={{ width: '100%', maxWidth: '420px', zIndex: 1, padding: '2.5rem' }}>
        <div className="text-center mb-8">
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Narrative Intelligence</h1>
          <p className="text-light" style={{ fontSize: '0.875rem' }}>Secure Administrator Access</p>
        </div>
        
        {error && <div className="alert alert-error">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
            />
          </div>
          <div className="form-group mb-6">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem' }}>
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
