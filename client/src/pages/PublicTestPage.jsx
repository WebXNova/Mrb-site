import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import { testsApi } from '../api/adminApi';
import { getStudentToken } from '../auth/session';
import '../styles/auth-pages.css';

export default function PublicTestPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [studentToken, setStudentToken] = useState(() => getStudentToken());
  const [studentName, setStudentName] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    setStudentToken(getStudentToken());
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await testsApi.getPublicTestMeta(slug);
        if (!cancelled) setMeta(response?.data || null);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Unable to load test details');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const displaySlug = String(slug || '').replace(/-/g, ' ') || 'this test';

  async function onUnlock(event) {
    event.preventDefault();
    setError('');
    setIsBusy(true);
    try {
      const token = getStudentToken();
      if (!token) {
        navigate(`/login?from=${encodeURIComponent(`/tests/${slug}`)}`, { replace: true });
        return;
      }
      setStudentToken(token);
      const response = await testsApi.verifyCode(
        slug,
        {
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
          <h1 className="heading-2">Start Test</h1>
          {meta ? (
            <p className="auth-subtitle" style={{ marginTop: '0.25rem' }}>
              <strong>{meta.title}</strong> | {meta.subject} | {meta.questionCount} questions | {meta.durationMinutes} min
            </p>
          ) : null}
          <p className="auth-subtitle">
            Open this test after sign in. The web address selects the paper (for example{' '}
            <span className="auth-slug-chip" translate="no">
              /tests/{slug}
            </span>
            ).
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

            {error ? <p className="admin-error auth-form__error">{error}</p> : null}

            <button
              className="btn btn--primary auth-form__submit"
              type="submit"
              disabled={isBusy || !studentToken}
            >
              {isBusy ? 'Starting…' : 'Start test'}
            </button>
          </form>

          <div className="auth-verify-tip" role="note">
            <p className="auth-verify-tip__title">How this works</p>
            <ul className="auth-verify-tip__list">
              <li>Teachers share a link like yours and students open it after sign in.</li>
              <li>After deployment, links work on any device with your live site URL.</li>
              <li>If the test does not start, contact support and share the test link.</li>
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
