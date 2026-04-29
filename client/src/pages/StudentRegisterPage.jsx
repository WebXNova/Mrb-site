import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import '../styles/auth-pages.css';

export default function StudentRegisterPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setIsBusy(true);
    setError('');
    try {
      const response = await studentApi.register({ fullName, email, password });
      const payload = response?.data;
      localStorage.setItem('student_access_token', payload.accessToken);
      localStorage.setItem('student_user', JSON.stringify(payload.student));
      navigate('/student', { replace: true });
    } catch (err) {
      setError(err.message || 'Register failed');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <h1 className="heading-2">Create Student Account</h1>
        <p className="auth-subtitle">Register once and access all MRB lectures and tests.</p>
        <form onSubmit={onSubmit} style={{ marginTop: '1rem' }}>
          <div className="admin-field">
            <label htmlFor="fullName">Full Name</label>
            <input id="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
          </div>
          <div className="admin-field" style={{ marginTop: '0.75rem' }}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="admin-field" style={{ marginTop: '0.75rem' }}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {error ? <p className="admin-error" style={{ marginTop: '0.75rem' }}>{error}</p> : null}
          <button className="btn btn--primary" type="submit" style={{ marginTop: '1rem' }} disabled={isBusy}>
            {isBusy ? 'Creating...' : 'Create Account'}
          </button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </section>
  );
}
