import { useCallback, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import { getStoredUser, setStudentAuth } from '../auth/session';
import PageLayout from '../components/layout/PageLayout';
import AuthBrandHeader from '../components/auth/AuthBrandHeader';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
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

  async function completeStudentSignIn(payload) {
    const existingStudent = getStoredUser('student_user');
    const studentUser = {
      ...payload.student,
      username: payload?.student?.username || existingStudent?.username || username || '',
    };
    setStudentAuth('__cookie_session__', studentUser);
    const next = safeRedirectPath(searchParams.get('from')) || '/dashboard';
    if (payload?.student?.isVerified !== true) {
      navigate('/verify-email', { replace: true });
    } else {
      navigate(next, { replace: true });
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    setIsBusy(true);
    setError('');
    try {
      const response = await studentApi.register({ fullName, username, email, password });
      await completeStudentSignIn(response?.data);
    } catch (err) {
      setError(err.message || 'Register failed');
    } finally {
      setIsBusy(false);
    }
  }

  const onGoogleCredential = useCallback(
    async (credential) => {
      setIsBusy(true);
      setError('');
      try {
        const response = await studentApi.googleLogin({ credential });
        await completeStudentSignIn(response?.data);
      } catch (err) {
        setError(err.message || 'Google sign-up failed');
      } finally {
        setIsBusy(false);
      }
    },
    [navigate, searchParams, username]
  );

  return (
    <PageLayout>
      <section className="auth-shell">
        <div className="auth-card auth-card--register">
          <AuthBrandHeader compact />
          <div className="auth-card__intro">
            <p className="auth-card__eyebrow">Join MRB Classes</p>
            <h1 className="heading-2">Create Student Account</h1>
            <p className="auth-subtitle">
              Register once and access all MRB lectures, tests, and student tools.
            </p>
          </div>
          <form onSubmit={onSubmit} className="auth-form">
            <div className="admin-field">
              <label htmlFor="fullName">Full Name</label>
              <input
                id="fullName"
                name="name"
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your full name"
                autoComplete="name"
                required
              />
            </div>
            <div className="admin-field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Choose a unique username"
                autoComplete="username"
                required
              />
            </div>
            <div className="admin-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="admin-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="new-password"
                type="password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
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
            <GoogleSignInButton onCredential={onGoogleCredential} disabled={isBusy} text="signup_with" />
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
