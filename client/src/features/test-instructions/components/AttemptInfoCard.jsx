import { formatAttemptLimit, formatAttemptsUsed } from '../utils/formatters';
import { formatStandaloneDateTime } from '../../../utils/testCatalogAvailability';

export default function AttemptInfoCard({ meta, prep, isAuthenticated }) {
  const maxAttempts = prep?.maxAttempts ?? meta?.maxAttempts ?? null;
  const attemptsUsed = prep?.attemptsUsed;
  const attemptsRemaining = prep?.attemptsRemaining;
  const hasActiveAttempt = prep?.hasActiveAttempt;
  const availability = prep?.availability;
  const listingStatus = prep?.listingStatus;
  const startLabel = formatStandaloneDateTime(availability?.startDate);
  const endLabel = formatStandaloneDateTime(availability?.endDate);

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
        {startLabel ? (
          <div className="ti-attempt__row">
            <dt>Starts</dt>
            <dd>{startLabel}</dd>
          </div>
        ) : null}
        {endLabel ? (
          <div className="ti-attempt__row">
            <dt>Ends</dt>
            <dd>{endLabel}</dd>
          </div>
        ) : null}
      </dl>

      {isAuthenticated && prep && listingStatus === 'closed' ? (
        <p className="ti-callout ti-callout--warn" role="alert">
          This test is currently closed by the administrator.
        </p>
      ) : null}

      {isAuthenticated && prep && prep.examOpen === false && listingStatus !== 'closed' ? (
        <p className="ti-callout ti-callout--warn" role="alert">
          This test is not open yet. MRB Classes must open the exam before you can start.
        </p>
      ) : null}

      {isAuthenticated && prep && prep.accessKind === 'paid_standalone' && prep.seatConfirmed === false ? (
        <p className="ti-callout ti-callout--warn" role="alert">
          Your seat is not confirmed yet. Register, submit payment, and wait for approval before you can start.
        </p>
      ) : null}

      {isAuthenticated && prep?.integrityBlocked ? (
        <p className="ti-callout ti-callout--warn" role="alert">
          This test is locked for your account after repeated focus warnings. Other tests are not affected.
        </p>
      ) : null}

      {isAuthenticated && prep?.seatsFull ? (
        <p className="ti-callout ti-callout--warn" role="alert">
          All seats for this test are taken.
        </p>
      ) : null}

      {availability?.notYetAvailable && listingStatus !== 'closed' ? (
        <p className="ti-callout ti-callout--warn" role="alert">
          This test is upcoming.
          {startLabel ? ` Starts ${startLabel}.` : null}
        </p>
      ) : null}

      {availability?.noLongerAvailable && !hasActiveAttempt ? (
        <p className="ti-callout ti-callout--warn" role="alert">
          This test is no longer accepting new attempts.
          {endLabel ? ` The window ended ${endLabel}.` : null}
        </p>
      ) : null}

      {hasActiveAttempt ? (
        <p className="ti-callout ti-callout--info" role="status">
          You have an active attempt in progress. Your test session was saved. Select{' '}
          <strong>Continue test</strong> to resume.
        </p>
      ) : null}

      {isAuthenticated && prep && prep.canStart === false && prep.retakePolicy?.denyCode === 'RETAKE_NOT_ALLOWED' ? (
        <p className="ti-callout ti-callout--warn" role="alert">
          Retakes are not allowed for this test. You cannot start a new attempt.
        </p>
      ) : null}

      {isAuthenticated && prep && prep.canStart === false && prep.retakePolicy?.denyCode === 'MAX_ATTEMPTS_REACHED' ? (
        <p className="ti-callout ti-callout--warn" role="alert">
          You have used all allowed attempts for this test.
        </p>
      ) : null}

      {isAuthenticated &&
      prep &&
      prep.canStart === false &&
      !prep.retakePolicy?.denyCode &&
      prep.examOpen !== false &&
      prep.seatConfirmed !== false &&
      !prep.integrityBlocked &&
      !prep.seatsFull &&
      !availability?.notYetAvailable &&
      !(availability?.noLongerAvailable && !hasActiveAttempt) ? (
        <p className="ti-callout ti-callout--warn" role="alert">
          {prep.retakePolicy?.denyReason || 'You cannot start this test right now.'}
        </p>
      ) : null}
    </section>
  );
}
