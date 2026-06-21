import { useCallback, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import { getStoredUser, setStudentAuth } from '../auth/session';
import PageLayout from '../components/layout/PageLayout';
import AuthBrandHeader from '../components/auth/AuthBrandHeader';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import { safeRedirectPath } from '../utils/authRedirect';
import '../styles/auth-pages.css';

export default function StudentLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  async function completeStudentSignIn(payload) {
    const existingStudent = getStoredUser('student_user');
    const studentUser = {
      ...payload.student,
      username: payload?.student?.username || existingStudent?.username || '',
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
      const trimmedIdentifier = identifier.trim();
      const trimmedPassword = password.trim();
      if (!trimmedIdentifier || !trimmedPassword) {
        setError('Enter your identifier and password.');
        return;
      }
      const response = await studentApi.login({
        identifier: trimmedIdentifier,
        password: trimmedPassword,
      });
      await completeStudentSignIn(response?.data);
    } catch (err) {
      setError(err.message || 'Login failed');
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
        setError(err.message || 'Google sign-in failed');
      } finally {
        setIsBusy(false);
      }
    },
    [navigate, searchParams]
  );

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
              <label htmlFor="identifier">Email or Username</label>
              <input
                id="identifier"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="Enter your email or username"
                autoComplete="username"
                required
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
          <div className="auth-social auth-social--footer">
            <GoogleSignInButton onCredential={onGoogleCredential} disabled={isBusy} text="signin_with" />
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
