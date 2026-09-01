export default function TestInstructionsError({ message, onRetry }) {
  return (
    <div className="ti-state ti-state--error" role="alert">
      <h2 className="ti-state__title">Access is not available</h2>
      <p className="ti-state__message">
        {message || 'You do not have access to this test. If you believe this is a mistake, sign in with your enrolled account or contact MRB Classes.'}
      </p>
      {onRetry ? (
        <button type="button" className="btn btn--secondary" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
