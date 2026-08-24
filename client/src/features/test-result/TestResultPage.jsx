import { Link, useLocation, useParams } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import { getAttemptSession } from '../test-instructions/utils/attemptSession';
import { TIME_UP_SUBMITTED_MESSAGE } from '../test-taking/hooks/useSubmitAttempt';
import ResultReviewSection from './components/ResultReviewSection';
import ResultSummaryCards from './components/ResultSummaryCards';
import TestResultError from './components/TestResultError';
import TestResultErrorBoundary from './components/TestResultErrorBoundary';
import TestResultSkeleton from './components/TestResultSkeleton';
import { useTestResult } from './hooks/useTestResult';
import './styles/test-result.css';

function TestResultContent() {
  const { slug } = useParams();
  const location = useLocation();
  const session = getAttemptSession(slug);
  const attemptId = location.state?.attemptId ?? session.attemptId;
  const timedOut = Boolean(location.state?.timedOut);

  const { result, status, errorState, reload } = useTestResult({ slug, attemptId });

  if (!attemptId) {
    return (
      <PageLayout>
        <div className="tr-shell">
          <TestResultError
            errorState={{ kind: 'not_found', message: 'No submitted attempt found for this test.' }}
            slug={slug}
          />
        </div>
      </PageLayout>
    );
  }

  if (status === 'loading') {
    return (
      <PageLayout>
        <div className="tr-shell">
          <TestResultSkeleton />
        </div>
      </PageLayout>
    );
  }

  if (status === 'error') {
    return (
      <PageLayout>
        <div className="tr-shell">
          <TestResultError errorState={errorState} slug={slug} onRetry={reload} />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="tr-shell">
        <div className="tr-page">
          <header className="tr-header">
            <p className="tr-eyebrow">Official result</p>
            <h1 className="tr-title">{result?.testTitle || 'Test result'}</h1>
            <p className="tr-subtitle">All scores and grades are calculated by the server.</p>
            {timedOut ? (
              <p className="tr-timeout-banner" role="status">
                {TIME_UP_SUBMITTED_MESSAGE}
              </p>
            ) : null}
          </header>

          <ResultSummaryCards result={result} />

          {result?.scoreBandMessageHtml ? (
            <section className="tr-score-band-message" aria-labelledby="tr-score-band-heading">
              <h2 id="tr-score-band-heading" className="tr-section-title">
                Feedback
              </h2>
              <div
                className="tr-score-band-message__body rich-text"
                dangerouslySetInnerHTML={{ __html: result.scoreBandMessageHtml }}
              />
            </section>
          ) : null}

          {result?.hasReview ? (
            <ResultReviewSection items={result.reviewItems} />
          ) : (
            <section className="tr-review-unavailable" aria-labelledby="tr-review-unavailable-heading">
              <h2 id="tr-review-unavailable-heading" className="tr-section-title">
                Answer review
              </h2>
              <p className="tr-review-unavailable__message">
                Detailed answer review is not available for this test. Your summary scores above are
                official.
              </p>
            </section>
          )}

          <footer className="tr-footer">
            <Link className="btn btn--secondary" to="/dashboard/tests">
              View all tests
            </Link>
            {slug ? (
              <Link className="btn btn--primary" to={`/tests/${slug}`}>
                Back to test page
              </Link>
            ) : null}
          </footer>
        </div>
      </div>
    </PageLayout>
  );
}

export default function TestResultPage() {
  return (
    <TestResultErrorBoundary>
      <TestResultContent />
    </TestResultErrorBoundary>
  );
}
