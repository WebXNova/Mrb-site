import { Link } from 'react-router-dom';

export default function TestTakingError({ message, slug, onRetry }) {
  return (
    <div className="tt-state tt-state--error" role="alert">
      <h2 className="tt-state__title">Unable to load exam</h2>
      <p className="tt-state__message">{message || 'Something went wrong.'}</p>
      <div className="tt-state__actions">
        {onRetry ? (
          <button type="button" className="btn btn--secondary" onClick={onRetry}>
            Try again
          </button>
        ) : null}
        {slug ? (
          <Link className="btn btn--primary" to={`/tests/${slug}`}>
            Return to test start
          </Link>
        ) : null}
      </div>
    </div>
  );
}
