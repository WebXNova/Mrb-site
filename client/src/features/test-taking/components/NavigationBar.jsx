export default function NavigationBar({
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  onSubmit,
  isSubmitting,
  disabled,
  progressLabel,
}) {
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
      {progressLabel ? (
        <p className="tt-nav__progress" aria-live="polite">
          {progressLabel}
        </p>
      ) : null}
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
      >
        Submit test
      </button>
    </nav>
  );
}
