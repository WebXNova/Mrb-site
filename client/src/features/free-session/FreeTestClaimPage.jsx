import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import { standaloneTestsApi, markStandaloneSession } from '../../api/standaloneTestsApi';
import { getStudentToken } from '../../auth/session';
import { usePageSeo } from '../../seo/SeoContext';
import { getUserFacingErrorMessage } from '../../utils/errorHandler';
import { withSafeFromQuery } from '../../utils/authRedirect';
import { freeTestPath } from './freeSessionNav';
import '../test-instructions/styles/test-instructions.css';

export default function FreeTestClaimPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [needsAccount, setNeedsAccount] = useState(!getStudentToken());
  const [message, setMessage] = useState('Confirming your account and saving your result…');
  const [error, setError] = useState('');

  usePageSeo({
    title: 'Confirm account | MRB Classes',
    description: 'Link your free session result to your student account.',
    noindex: true,
  });

  const claimPath = freeTestPath(slug, 'claim');

  useEffect(() => {
    markStandaloneSession(slug, 'free_standalone');
    if (!getStudentToken()) {
      setNeedsAccount(true);
      setMessage('');
      return undefined;
    }

    setNeedsAccount(false);
    let cancelled = false;
    (async () => {
      try {
        const response = await standaloneTestsApi.freeSessionClaim(slug);
        const data = response?.data;
        if (cancelled) return;
        if (data?.resultAvailable === false) {
          navigate(freeTestPath(slug, 'submitted'), { replace: true, state: { attemptId: data.attemptId } });
          return;
        }
        navigate(freeTestPath(slug, 'result'), { replace: true, state: { attemptId: data?.attemptId } });
      } catch (err) {
        if (cancelled) return;
        const code = err?.errorCode || err?.code || '';
        if (code === 'FREE_SESSION_ENROLLMENT_REQUIRED') {
          navigate(freeTestPath(slug, 'enroll'), { replace: true });
          return;
        }
        setError(getUserFacingErrorMessage(err, 'Could not save your result to this account.'));
        setMessage('');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, slug]);

  return (
    <PageLayout>
      <div className="ti-shell">
        <div className="ti-page">
          <header className="ti-header">
            <p className="ti-eyebrow">Free session</p>
            <h1 className="ti-title">{needsAccount ? 'Login / Sign up' : 'Confirm your account'}</h1>
          </header>
          {needsAccount ? (
            <section className="ti-start">
              <p className="ti-start__lede">
                Your test is saved. Sign in or create a student account to attach this result to your
                profile. You will not need to retake the test.
              </p>
              <p>
                <Link className="btn btn--primary" to={withSafeFromQuery('/login', claimPath)}>
                  Sign in
                </Link>
                {' '}
                <Link className="btn btn--secondary" to={withSafeFromQuery('/register', claimPath)}>
                  Create account
                </Link>
              </p>
              <p>
                <Link to={freeTestPath(slug, 'enroll')} className="ti-link-muted">
                  Return to your information
                </Link>
              </p>
            </section>
          ) : null}
          {message ? <p role="status">{message}</p> : null}
          {error ? (
            <div className="ti-callout ti-callout--warn" role="alert">
              <p>{error}</p>
              <p>
                <Link to={withSafeFromQuery('/login', claimPath)}>Sign in again</Link>
                {' · '}
                <Link to={freeTestPath(slug, 'enroll')}>Return to your information</Link>
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </PageLayout>
  );
}
