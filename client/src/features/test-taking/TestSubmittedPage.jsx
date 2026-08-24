import { Link, useLocation, useParams } from 'react-router-dom';
import { TIME_UP_SUBMITTED_MESSAGE } from './hooks/useSubmitAttempt';
import PageLayout from '../../components/layout/PageLayout';
import { clearAttemptSession } from '../test-taking/utils/attemptSession';
import './styles/test-submitted.css';

/**
 * Shown after submit when show_result_immediately is disabled — avoids a 403 on the result page.
 */
export default function TestSubmittedPage() {
  const { slug } = useParams();
  const timedOut = Boolean(useLocation().state?.timedOut);

  if (slug) {
    clearAttemptSession(slug);
  }

  return (
    <PageLayout>
      <div className="ts-shell">
        <div className="ts-card" role="status">
          <p className="ts-eyebrow">Submission received</p>
          <h1 className="ts-title">
            {timedOut ? TIME_UP_SUBMITTED_MESSAGE : 'Your answers have been submitted'}
          </h1>
          <p className="ts-lead">
            {timedOut
              ? 'Unanswered questions were left blank. Results follow the test’s release settings.'
              : 'Results for this test are not released immediately. Your instructor will publish scores when they are ready — check your dashboard later.'}
          </p>
          <div className="ts-actions">
            <Link className="btn btn--primary" to="/dashboard/tests">
              Go to my tests
            </Link>
            {slug ? (
              <Link className="btn btn--secondary" to={`/tests/${slug}`}>
                Back to test page
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
