import { useEffect } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

export default function SubmitConfirmModal({
  isOpen,
  totalQuestions,
  answeredCount,
  unansweredCount,
  isSubmitting,
  submitError,
  timedOut = false,
  onContinue,
  onConfirm,
  onRetry,
}) {
  const modalRef = useFocusTrap(isOpen, {
    onEscape: onContinue,
    escapeEnabled: !isSubmitting,
  });

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const titleId = 'tt-submit-modal-title';
  const descId = 'tt-submit-modal-desc';

  return (
    <div className="tt-submit-modal" role="presentation">
      <button
        type="button"
        className="tt-submit-modal__backdrop"
        onClick={isSubmitting ? undefined : onContinue}
        aria-label="Close submission dialog"
        tabIndex={-1}
        disabled={isSubmitting}
      />

      <div
        ref={modalRef}
        className="tt-submit-modal__dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <header className="tt-submit-modal__header">
          <div className="tt-submit-modal__icon" aria-hidden="true">
            !
          </div>
          <h2 id={titleId} className="tt-submit-modal__title">
            {timedOut ? 'Time is up' : 'Submit test?'}
          </h2>
        </header>

        <div id={descId} className="tt-submit-modal__body">
          <p className="tt-submit-modal__warning">
            {timedOut
              ? 'Time is up. Your answered questions are being submitted automatically.'
              : `You have answered ${answeredCount} of ${totalQuestions} questions. You cannot change answers after submission.`}
          </p>

          <dl className="tt-submit-modal__stats">
            <div className="tt-submit-modal__stat">
              <dt>Total questions</dt>
              <dd>{totalQuestions}</dd>
            </div>
            <div className="tt-submit-modal__stat tt-submit-modal__stat--answered">
              <dt>Answered</dt>
              <dd>{answeredCount}</dd>
            </div>
            <div className="tt-submit-modal__stat tt-submit-modal__stat--unanswered">
              <dt>Unanswered</dt>
              <dd>{unansweredCount}</dd>
            </div>
          </dl>

          {unansweredCount > 0 && !isSubmitting && !timedOut ? (
            <p className="tt-submit-modal__note" role="status">
              {unansweredCount} question{unansweredCount === 1 ? '' : 's'} still unanswered.
              You can continue the test or submit anyway.
            </p>
          ) : null}

          {submitError ? (
            <p className="tt-submit-modal__error" role="alert">
              {submitError}
            </p>
          ) : null}

          {isSubmitting ? (
            <p className="tt-submit-modal__loading" role="status" aria-live="polite">
              {timedOut ? 'Time is up. Your test is being submitted.' : 'Submitting your test… Please do not close this page.'}
            </p>
          ) : null}
        </div>

        <footer className="tt-submit-modal__actions">
          {!timedOut ? (
            <button
              type="button"
              className="btn btn--secondary tt-submit-modal__btn"
              onClick={onContinue}
              disabled={isSubmitting}
            >
              Continue test
            </button>
          ) : null}

          {submitError && onRetry ? (
            <button
              type="button"
              className="btn btn--primary tt-submit-modal__btn"
              onClick={onRetry}
              disabled={isSubmitting}
            >
              Try again
            </button>
          ) : !timedOut ? (
            <button
              type="button"
              className="btn btn--primary tt-submit-modal__btn"
              onClick={onConfirm}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? 'Submitting…' : 'Submit test'}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
