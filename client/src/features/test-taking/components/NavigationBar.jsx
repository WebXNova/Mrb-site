export default function NavigationBar({
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  onSubmit,
  isSubmitting,
  disabled,
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
