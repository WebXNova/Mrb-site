export default function HistoryError({ message, onRetry }) {
  return (
    <div className="th-state th-state--error" role="alert">
      <h2 className="th-state__title">Unable to load results</h2>
      <p className="th-state__message">{message || 'Something went wrong.'}</p>
      {onRetry ? (
        <button type="button" className="btn btn--primary btn--sm" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
