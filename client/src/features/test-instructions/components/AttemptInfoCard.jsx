import { formatAttemptLimit, formatAttemptsUsed } from '../utils/formatters';

export default function AttemptInfoCard({ meta, prep, isAuthenticated }) {
  const maxAttempts = prep?.maxAttempts ?? meta?.maxAttempts ?? null;
  const attemptsUsed = prep?.attemptsUsed;
  const attemptsRemaining = prep?.attemptsRemaining;
  const hasActiveAttempt = prep?.hasActiveAttempt;
  const canStart = prep?.canStart;

  return (
    <section className="ti-card ti-card--wide ti-attempt" aria-labelledby="ti-attempt-heading">
      <h2 className="ti-section-title" id="ti-attempt-heading">
        Attempt information
      </h2>

      <dl className="ti-attempt__list">
        <div className="ti-attempt__row">
          <dt>Attempt limit</dt>
          <dd>{formatAttemptLimit(maxAttempts)}</dd>
        </div>

        {isAuthenticated && prep ? (
          <>
            <div className="ti-attempt__row">
              <dt>Your attempts</dt>
              <dd>{formatAttemptsUsed(attemptsUsed, maxAttempts) ?? '—'}</dd>
            </div>
            {attemptsRemaining != null ? (
              <div className="ti-attempt__row">
                <dt>Remaining</dt>
                <dd>{attemptsRemaining}</dd>
              </div>
            ) : null}
          </>
        ) : (
          <div className="ti-attempt__row">
            <dt>Your attempts</dt>
            <dd>Sign in to view your attempt history</dd>
          </div>
        )}
      </dl>

      {hasActiveAttempt ? (
        <p className="ti-callout ti-callout--info" role="status">
          You have an active attempt in progress. Select <strong>Start test</strong> to continue where
          you left off.
        </p>
      ) : null}

      {isAuthenticated && prep && canStart === false ? (
        <p className="ti-callout ti-callout--warn" role="alert">
          You have used all allowed attempts for this test.
        </p>
      ) : null}
    </section>
  );
}
