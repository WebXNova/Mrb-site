import { Link } from 'react-router-dom';

export default function TestResultError({ errorState, slug, onRetry }) {
  const kind = errorState?.kind ?? 'error';
  const message = errorState?.message ?? 'Could not load your result.';

  const title =
    kind === 'hidden'
      ? 'Results not available'
      : kind === 'unauthorized'
        ? 'Sign in required'
        : kind === 'not_found'
          ? 'Result not found'
          : kind === 'timeout'
            ? 'Request timed out'
            : kind === 'network'
              ? 'Connection problem'
              : 'Unable to load result';

  return (
    <div className="tr-state tr-state--error" role="alert">
      <h2 className="tr-state__title">{title}</h2>
      <p className="tr-state__message">{message}</p>
      <div className="tr-state__actions">
        {onRetry ? (
          <button type="button" className="btn btn--secondary" onClick={onRetry}>
            Try again
          </button>
        ) : null}
        {slug ? (
          <Link className="btn btn--primary" to={`/tests/${slug}`}>
            Back to test
          </Link>
        ) : null}
        <Link className="btn btn--secondary" to="/dashboard">
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
