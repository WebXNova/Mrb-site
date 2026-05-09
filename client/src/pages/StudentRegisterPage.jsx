import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import { setStudentAuth } from '../auth/session';
import PageLayout from '../components/layout/PageLayout';
import AuthBrandHeader from '../components/auth/AuthBrandHeader';
import { safeRedirectPath } from '../utils/authRedirect';
import '../styles/auth-pages.css';

export default function StudentRegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [fullName, setFullName] = useState('');
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
      const response = await studentApi.register({ fullName, username, email, password });
      const payload = response?.data;
      const studentUser = {
        ...payload.student,
        username: payload?.student?.username || username || '',
      };
      setStudentAuth('__cookie_session__', studentUser);
      if (payload?.student?.isVerified !== true) {
        navigate('/verify-email', { replace: true });
      } else if (payload?.student?.mrbEnrollmentVerified === true) {
        navigate('/dashboard', { replace: true });
      } else {
        navigate('/verify-mrb', { replace: true, state: { from: '/dashboard' } });
      }
    } catch (err) {
      setError(err.message || 'Register failed');
    } finally {
      setIsBusy(false);
    }
  }

  function onSocialSignup(provider) {
    setError(`${provider} sign up is coming soon.`);
  }

  return (
    <PageLayout>
      <section className="auth-shell">
        <div className="auth-card auth-card--register">
          <AuthBrandHeader subtitle="Join MRB Classes" compact />
          <h1 className="heading-2">Create Student Account</h1>
          <p className="auth-subtitle">
            Register once and access all MRB lectures, tests, and student tools.
          </p>
          <form onSubmit={onSubmit} className="auth-form">
            <div className="admin-field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </div>
            <div className="admin-field">
              <label htmlFor="fullName">Full Name</label>
              <input
                id="fullName"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
              />
            </div>
            <div className="admin-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="admin-field">
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
            {error ? <p className="admin-error auth-form__error">{error}</p> : null}
            <button className="btn btn--primary auth-form__submit" type="submit" disabled={isBusy}>
              {isBusy ? 'Creating...' : 'Create Account'}
            </button>
          </form>

          <p className="auth-footer">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
          <div className="auth-social auth-social--footer">
            <button
              type="button"
              className="btn btn--secondary auth-social__button"
              onClick={() => onSocialSignup('Google')}
            >
              <span className="auth-social__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="img">
                  <path
                    fill="#EA4335"
                    d="M12 10.2v3.9h5.5c-.2 1.2-.9 2.3-1.9 3l3 2.3c1.8-1.7 2.9-4.2 2.9-7.2 0-.7-.1-1.4-.2-2H12z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 22c2.6 0 4.8-.9 6.4-2.5l-3-2.3c-.8.6-2 .9-3.4.9-2.6 0-4.7-1.7-5.4-4H3.5v2.4A10 10 0 0 0 12 22z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M6.6 14.1A6 6 0 0 1 6.3 12c0-.7.1-1.4.3-2V7.6H3.5A10 10 0 0 0 2 12c0 1.6.4 3.1 1.2 4.5l3.4-2.4z"
                  />
                  <path
                    fill="#4285F4"
                    d="M12 5.9c1.4 0 2.6.5 3.6 1.4l2.7-2.7A9.9 9.9 0 0 0 12 2a10 10 0 0 0-8.5 5.6L6.6 10c.7-2.3 2.8-4.1 5.4-4.1z"
                  />
                </svg>
              </span>
              Sign up with Google
            </button>
            <button
              type="button"
              className="btn btn--secondary auth-social__button"
              onClick={() => onSocialSignup('Facebook')}
            >
              <span className="auth-social__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="img">
                  <path
                    fill="#1877F2"
                    d="M24 12a12 12 0 1 0-13.9 11.8v-8.3H7.1V12h3V9.4c0-3 1.8-4.7 4.6-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.3A12 12 0 0 0 24 12z"
                  />
                </svg>
              </span>
              Sign up with Facebook
            </button>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
