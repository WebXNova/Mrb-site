import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import { refreshStudentAccessToken } from '../api/authRefresh';
import { testsApi } from '../api/adminApi';
import { getStudentToken } from '../auth/session';
import '../styles/auth-pages.css';

function normaliseCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
}

export default function PublicTestPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [studentToken, setStudentToken] = useState(() => getStudentToken());
  const [studentName, setStudentName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    setStudentToken(getStudentToken());
  }, [slug]);

  const displaySlug = String(slug || '').replace(/-/g, ' ') || 'this test';

  async function onUnlock(event) {
    event.preventDefault();
    setError('');
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      setError('Please enter your full MRB access code.');
      return;
    }
    setIsBusy(true);
    try {
      let token = getStudentToken();
      if (!token) {
        try {
          await refreshStudentAccessToken();
        } catch {
          // non-fatal; may still have no token below
        }
        token = getStudentToken();
      }
      if (!token) {
        navigate(`/login?from=${encodeURIComponent(`/tests/${slug}`)}`, { replace: true });
        return;
      }
      setStudentToken(token);
      const response = await testsApi.verifyCode(
        slug,
        {
          code: trimmed,
          studentName: studentName.trim() || null,
        },
        token
      );
      const data = response?.data;
      if (!data?.attemptToken || !data?.attemptId) {
        throw new Error('Could not start attempt. Please try again.');
      }
      sessionStorage.setItem(
        `test_attempt_${slug}`,
        JSON.stringify({ attemptId: data.attemptId, attemptToken: data.attemptToken })
      );
      navigate(`/tests/${slug}/start`, { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid code');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <PageLayout>
      <section className="auth-shell auth-shell--verify">
        <div className="auth-card auth-card--verify auth-card--public-test">
          <p className="auth-card__eyebrow">MRB assessment</p>
          <h1 className="heading-2">Enter MRB code</h1>
          <p className="auth-subtitle">
            This session is unlocked with your official MRB access code after you sign in. The web address selects the
            paper (for example{' '}
            <span className="auth-slug-chip" translate="no">
              /tests/{slug}
            </span>
            ); your code authorizes access.
          </p>

          <form onSubmit={onUnlock} className="auth-form auth-form--verify" noValidate>
            {!studentToken ? (
              <p className="auth-callout auth-callout--warn">
                Sign in with your student account first, then enter your code below.
                <Link to={`/login?from=${encodeURIComponent(`/tests/${slug}`)}`}> Go to sign in</Link>
              </p>
            ) : null}

            <div className="admin-field">
              <label htmlFor="studentName">Your name (optional)</label>
              <input
                id="studentName"
                value={studentName}
                onChange={(event) => setStudentName(event.target.value)}
                placeholder="Shows on results if provided"
                autoComplete="name"
              />
            </div>

            <div className="admin-field">
              <label htmlFor="mrbCode">MRB access code</label>
              <input
                id="mrbCode"
                className="auth-mrb-code-input"
                value={code}
                onChange={(event) => setCode(normaliseCode(event.target.value))}
                placeholder="Enter code"
                autoComplete="one-time-code"
                inputMode="text"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={40}
                aria-invalid={Boolean(error)}
                aria-describedby="public-test-code-hint"
                disabled={!studentToken}
              />
              <span id="public-test-code-hint" className="auth-field-hint">
                Same style of code used across MRB — letters and digits, hyphens ok. Applies to{' '}
                <strong translate="no">{displaySlug}</strong>.
              </span>
            </div>

            {error ? <p className="admin-error auth-form__error">{error}</p> : null}

            <button
              className="btn btn--primary auth-form__submit"
              type="submit"
              disabled={isBusy || !studentToken}
            >
              {isBusy ? 'Unlocking…' : 'Unlock test'}
            </button>
          </form>

          <div className="auth-verify-tip" role="note">
            <p className="auth-verify-tip__title">How this works</p>
            <ul className="auth-verify-tip__list">
              <li>Teachers share a link like yours; each student uses their own MRB code.</li>
              <li>After deployment, links work on any device with your live site URL.</li>
              <li>Problems with the code usually mean typo, expiry, or max uses — contact MRB support.</li>
            </ul>
          </div>

          <p className="auth-footer">
            New student? <Link to={`/register?from=${encodeURIComponent(`/tests/${slug}`)}`}>Create account</Link>
          </p>
          <p className="auth-footer auth-footer--compact">
            Have an account? <Link to={`/login?from=${encodeURIComponent(`/tests/${slug}`)}`}>Sign in</Link>
          </p>
          <p className="auth-footer auth-footer--compact">
            <Link to="/" className="auth-footer-link--muted">
              Back to website
            </Link>
          </p>
        </div>
      </section>
    </PageLayout>
  );
}
