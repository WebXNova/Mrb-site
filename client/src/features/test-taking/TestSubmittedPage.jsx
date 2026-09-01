import { Link, useLocation, useParams } from 'react-router-dom';
import { TIME_UP_SUBMITTED_MESSAGE } from './hooks/useSubmitAttempt';
import PageLayout from '../../components/layout/PageLayout';
import { usePageSeo } from '../../seo/SeoContext';
import { clearAttemptSession } from './utils/attemptSession';
import { getStandaloneSessionKind } from '../../api/standaloneTestsApi';
import './styles/test-submitted.css';

/**
 * Shown after submit when show_result_immediately is disabled — avoids a 403 on the result page.
 */
export default function TestSubmittedPage() {
  const { slug } = useParams();
  const timedOut = Boolean(useLocation().state?.timedOut);

  usePageSeo({
    title: 'Test submitted | MRB Classes',
    description: 'Your test was submitted.',
    noindex: true,
  });

  if (slug) {
    clearAttemptSession(slug);
  }

  const kind = slug ? getStandaloneSessionKind(slug) : null;
  const testsHome = kind === 'paid_standalone' || kind === 'free_standalone' ? '/tests/my-results' : '/dashboard/tests';
  const backHref =
    kind === 'paid_standalone' && slug
      ? `/paid-tests/${slug}`
      : kind === 'free_standalone' && slug
        ? `/free-test/${slug}`
        : slug
          ? `/tests/${slug}`
          : null;

  return (
    <PageLayout>
      <div className="ts-shell">
        <div className="ts-card" role="status">
          <p className="ts-eyebrow">Submission received</p>
          <h1 className="ts-title">
            {timedOut ? TIME_UP_SUBMITTED_MESSAGE : 'Your test has been submitted successfully.'}
          </h1>
          <p className="ts-lead">
            Results are currently being reviewed. Please check this page again when results are
            published. Scores are not shown until the administrator releases them.
          </p>
          <div className="ts-actions">
            <Link className="btn btn--primary" to={testsHome}>
              {kind ? 'My Results' : 'Go to my tests'}
            </Link>
            {backHref ? (
              <Link className="btn btn--secondary" to={backHref}>
                Back to test page
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
