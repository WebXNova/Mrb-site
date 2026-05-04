import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import { getStoredUser, setStudentAuth } from '../auth/session';
import PageLayout from '../components/layout/PageLayout';
import AuthBrandHeader from '../components/auth/AuthBrandHeader';
import { safeRedirectPath } from '../utils/authRedirect';
import '../styles/auth-pages.css';

export default function StudentLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setIsBusy(true);
    setError('');
    try {
      const identifier = `${email}`.trim() || `${username}`.trim();
      if (!identifier) {
        setError('Enter your email or username.');
        return;
      }
      const response = await studentApi.login({
        ...(identifier.includes('@') ? { email: identifier } : { username: identifier }),
        password,
      });
      const payload = response?.data;
      const existingStudent = getStoredUser('student_user');
      const studentUser = {
        ...payload.student,
        username: payload?.student?.username || existingStudent?.username || username || '',
      };
      setStudentAuth(payload.accessToken, studentUser);
      const next = safeRedirectPath(searchParams.get('from')) || '/dashboard';
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <PageLayout>
      <section className="auth-shell">
        <div className="auth-card auth-card--login">
          <AuthBrandHeader subtitle="Student sign in" compact />
          <h1 className="heading-2">Student Login</h1>
          <p className="auth-subtitle">
            Sign in with your email or username and password.
          </p>
          <form onSubmit={onSubmit} className="auth-form">
            <div className="admin-field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Or sign in with username"
                autoComplete="username"
              />
            </div>
            <div className="admin-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Or sign in with email"
                autoComplete="email"
              />
            </div>
            <div className="admin-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error ? <p className="admin-error auth-form__error">{error}</p> : null}
            <button className="btn btn--primary auth-form__submit" type="submit" disabled={isBusy}>
              {isBusy ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <p className="auth-footer">
            New student? <Link to="/register">Create account</Link>
          </p>
          <p className="auth-footer auth-footer--compact">
            Forgot password? <Link to="/forgot-password">Reset it</Link>
          </p>
        </div>
      </section>
    </PageLayout>
  );
}
