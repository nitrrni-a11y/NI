import { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Sparkles } from 'lucide-react';
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
    <div className="admin-login-shell">
      <div className="admin-login-bg" aria-hidden="true" />

      <div className="admin-login-card">
        <div className="admin-login-header">
          <span className="hero-badge admin-badge">
           
            Secure Admin Access
          </span>
          <div className="admin-lock-wrap">
            <ShieldCheck size={26} />
          </div>
          <h1>Narrative Intelligence</h1>
          <p>Operations control and content intelligence workspace</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="admin-login-form">
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

          <button type="submit" className="btn btn-primary admin-login-btn">
            Sign in to dashboard
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
