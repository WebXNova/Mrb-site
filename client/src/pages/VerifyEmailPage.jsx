import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import { clearAllAuth, getStoredUser } from '../auth/session';
import PageLayout from '../components/layout/PageLayout';
import '../styles/auth-pages.css';

function readTokenFromLocation() {
  const search = window.location.search || '';
  const queryToken = new URLSearchParams(search).get('token');
  if (queryToken) {
    return { token: String(queryToken).trim(), source: 'query' };
  }
  const hash = window.location.hash || '';
  if (hash.startsWith('#token=')) {
    return { token: String(hash.slice('#token='.length)).trim(), source: 'hash' };
  }
  return { token: '', source: 'none' };
}

function scrubTokenFromLocation() {
  if (typeof window === 'undefined') return;
  const cleanUrl = window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);
}

export default function VerifyEmailPage() {
  const requestedRef = useRef(false);
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Verifying your email...');
  const tokenRead = useMemo(() => readTokenFromLocation(), []);
  const token = tokenRead.token;

  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    if (!token) {
      // Common case: user landed here from login/register/dashboard redirect — URL has no token.
      // The real verification link is only in the email (?token=... or legacy #token=).
      setStatus('pending');
      setMessage(
        'We sent a verification link to your email. Open that link to complete verification. If you opened this page from the app after signing in, that is expected — use the link in your inbox (it includes the token), or resend below.'
      );
      return;
    }
    if (tokenRead.source === 'hash' || tokenRead.source === 'query') {
      scrubTokenFromLocation();
    }
    studentApi
      .verifyEmail(token)
      .then(() => {
        clearAllAuth();
        setStatus('success');
        setMessage('Your email has been verified. Please sign in again to continue.');
      })
      .catch((error) => {
        setStatus('error');
        setMessage(error?.message || 'Invalid or expired verification link.');
      });
  }, [token]);

  async function onResend() {
    try {
      const student = getStoredUser('student_user');
      const email = String(student?.email || '').trim();
      if (!email) {
        setMessage('Please sign in again to resend verification email.');
        return;
      }
      await studentApi.resendVerification({ email });
      setMessage('If the email exists, a verification email has been sent.');
    } catch {
      setMessage('If the email exists, a verification email has been sent.');
    }
  }

  return (
    <PageLayout>
      <section className="auth-shell">
        <div className="auth-card auth-card--verify">
          <h1 className="heading-2">Verify Email</h1>
          <p className="auth-subtitle">{message}</p>
          {status === 'loading' ? (
            <p className="auth-footer">Please wait...</p>
          ) : (
            <div className="auth-form">
              {status === 'success' ? (
                <Link className="btn btn--primary auth-form__submit" to="/login">
                  Continue to login
                </Link>
              ) : (
                <>
                  <button type="button" className="btn btn--primary auth-form__submit" onClick={onResend}>
                    Resend verification email
                  </button>
                  <Link className="btn btn--secondary auth-form__submit" to="/login">
                    Back to login
                  </Link>
                  <Link className="btn btn--secondary auth-form__submit" to="/register">
                    Back to register
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </PageLayout>
  );
}

