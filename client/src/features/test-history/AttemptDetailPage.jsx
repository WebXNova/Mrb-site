import { Link, useParams } from 'react-router-dom';
import ResultReviewSection from '../test-result/components/ResultReviewSection';
import ResultStatusBadge from '../test-result/components/ResultStatusBadge';
import TestResultError from '../test-result/components/TestResultError';
import TestResultSkeleton from '../test-result/components/TestResultSkeleton';
import { useTestResult } from '../test-result/hooks/useTestResult';
import {
  formatPercentageDisplay,
  formatScoreDisplay,
  formatTimeTaken,
} from '../test-result/utils/formatDisplay';
import { formatSubmittedDate } from './utils/formatDisplay';
import '../test-result/styles/test-result.css';
import './styles/test-history.css';

function AttemptMetaCard({ label, value, id }) {
  return (
    <article className="th-detail-card" aria-labelledby={id}>
      <p className="th-detail-card__label" id={id}>
        {label}
      </p>
      <p className="th-detail-card__value">{value}</p>
    </article>
  );
}

export default function AttemptDetailPage() {
  const { attemptId } = useParams();
  const { result, status, errorState, reload } = useTestResult({
    slug: null,
    attemptId: Number(attemptId),
  });

  if (status === 'loading') {
    return (
      <div className="th-detail-shell">
        <TestResultSkeleton />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="th-detail-shell">
        <TestResultError
          errorState={errorState}
          slug={null}
          onRetry={reload}
        />
        <p className="th-detail-back">
          <Link to="/dashboard/tests/history">← Back to results</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="th-detail-shell">
      <header className="th-detail-header">
        <p className="th-detail-eyebrow">Attempt details</p>
        <h1 className="th-detail-title">{result?.testTitle || 'Test result'}</h1>
        <div className="th-detail-header__badge">
          <ResultStatusBadge status={result?.status} />
        </div>
        {result?.submittedAt ? (
          <p className="th-detail-submitted">
            Submitted {formatSubmittedDate(result.submittedAt)}
          </p>
        ) : null}
      </header>

      <section className="th-detail-grid" aria-labelledby="th-detail-summary-heading">
        <h2 id="th-detail-summary-heading" className="visually-hidden">
          Attempt summary
        </h2>
        <AttemptMetaCard
          id="th-detail-score"
          label="Score"
          value={formatScoreDisplay(result?.score, result?.maxScore)}
        />
        <AttemptMetaCard
          id="th-detail-percentage"
          label="Percentage"
          value={formatPercentageDisplay(result?.percentage)}
        />
        <AttemptMetaCard
          id="th-detail-correct"
          label="Correct answers"
          value={result?.correctAnswers ?? '—'}
        />
        <AttemptMetaCard
          id="th-detail-wrong"
          label="Wrong answers"
          value={result?.wrongAnswers ?? '—'}
        />
        <AttemptMetaCard
          id="th-detail-unanswered"
          label="Unanswered"
          value={result?.unansweredAnswers ?? '—'}
        />
        <AttemptMetaCard
          id="th-detail-time"
          label="Time taken"
          value={formatTimeTaken(result?.timeTakenSeconds)}
        />
      </section>

      {result?.hasReview ? (
        <ResultReviewSection items={result.reviewItems} />
      ) : (
        <section className="tr-review-unavailable" aria-labelledby="th-detail-review-heading">
          <h2 id="th-detail-review-heading" className="tr-section-title">
            Detailed answers
          </h2>
          <p className="tr-review-unavailable__message">
            Answer review is not available for this test. Summary scores above are official.
          </p>
        </section>
      )}

      <footer className="th-detail-footer">
        <Link className="btn btn--secondary" to="/dashboard/tests/history">
          Back to results
        </Link>
      </footer>
    </div>
  );
}
