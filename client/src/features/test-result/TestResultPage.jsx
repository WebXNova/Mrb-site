import { Link, useParams } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import { getAttemptSession } from '../test-instructions/utils/attemptSession';
import ResultReviewSection from './components/ResultReviewSection';
import ResultSummaryCards from './components/ResultSummaryCards';
import TestResultError from './components/TestResultError';
import TestResultErrorBoundary from './components/TestResultErrorBoundary';
import TestResultSkeleton from './components/TestResultSkeleton';
import { useTestResult } from './hooks/useTestResult';
import './styles/test-result.css';

function TestResultContent() {
  const { slug } = useParams();
  const session = getAttemptSession(slug);
  const attemptId = session.attemptId;

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
          </header>

          <ResultSummaryCards result={result} />

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
