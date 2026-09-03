export default function NavigationBar({
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  onSubmit,
  isSubmitting,
  submitStatus,
  disabled,
  progressLabel,
  answeredCount,
  unansweredCount,
}) {
  const submitLabel =
    submitStatus === 'success'
      ? 'Submitted'
      : isSubmitting
        ? 'Submitting Test...'
        : 'Submit Test';

  return (
    <nav className="tt-nav" aria-label="Question navigation">
      <button
        type="button"
        className="btn btn--secondary"
        onClick={onPrevious}
        disabled={!canGoPrevious || disabled || isSubmitting}
      >
        Previous
      </button>
      <div className="tt-nav__meta">
        {progressLabel ? (
          <p className="tt-nav__progress" aria-live="polite">
            {progressLabel}
          </p>
        ) : null}
        {Number.isFinite(answeredCount) && Number.isFinite(unansweredCount) ? (
          <p className="tt-nav__counts">
            {answeredCount} answered · {unansweredCount} unanswered
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="btn btn--secondary"
        onClick={onNext}
        disabled={!canGoNext || disabled || isSubmitting}
      >
        Next
      </button>
      <button
        type="button"
        className="btn btn--primary tt-nav__submit"
        onClick={onSubmit}
        disabled={disabled || isSubmitting}
        aria-busy={isSubmitting}
      >
        {submitLabel}
      </button>
    </nav>
  );
}
