import { Link } from 'react-router-dom';
import { isFreeGuestRuntime } from '../../free-session/freeSessionNav';

export default function TestTakingError({ message, slug, onRetry }) {
  return (
    <div className="tt-state tt-state--error" role="alert">
      <h2 className="tt-state__title">Unable to load this test.</h2>
      <p className="tt-state__message">
        {message || 'Unable to load this test. Please try again.'}
      </p>
      <div className="tt-state__actions">
        {onRetry ? (
          <button type="button" className="btn btn--secondary" onClick={onRetry}>
            Try Again
          </button>
        ) : null}
        {slug ? (
          <Link className="btn btn--primary" to={isFreeGuestRuntime(slug) ? `/free-test/${slug}` : `/tests/${slug}`}>
            Return to test start
          </Link>
        ) : null}
      </div>
    </div>
  );
}
