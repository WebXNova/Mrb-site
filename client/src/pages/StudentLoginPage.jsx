import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import '../styles/auth-pages.css';

export default function StudentLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setIsBusy(true);
    setError('');
    try {
      const response = await studentApi.login({ email, password });
      const payload = response?.data;
      localStorage.setItem('student_access_token', payload.accessToken);
      localStorage.setItem('student_user', JSON.stringify(payload.student));
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <h1 className="heading-2">Student Login</h1>
        <p className="auth-subtitle">Sign in to access your portal, lectures, tests, and results.</p>
        <form onSubmit={onSubmit} style={{ marginTop: '1rem' }}>
          <div className="admin-field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="admin-field" style={{ marginTop: '0.75rem' }}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {error ? <p className="admin-error" style={{ marginTop: '0.75rem' }}>{error}</p> : null}
          <button className="btn btn--primary" type="submit" style={{ marginTop: '1rem' }} disabled={isBusy}>
            {isBusy ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className="auth-footer">
          New student? <Link to="/register">Create account</Link>
        </p>
        <p className="auth-footer" style={{ marginTop: '0.4rem' }}>
          Forgot password? <Link to="/forgot-password">Reset it</Link>
        </p>
      </div>
    </section>
  );
}
