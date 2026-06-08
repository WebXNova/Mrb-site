export default function TestInstructionsError({ message, onRetry }) {
  return (
    <div className="ti-state ti-state--error" role="alert">
      <h2 className="ti-state__title">Unable to load test</h2>
      <p className="ti-state__message">{message || 'Something went wrong while loading this test.'}</p>
      {onRetry ? (
        <button type="button" className="btn btn--secondary" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
