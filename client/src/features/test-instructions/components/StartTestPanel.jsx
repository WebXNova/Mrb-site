import { Link } from 'react-router-dom';

export default function StartTestPanel({
  slug,
  isAuthenticated,
  isStarting,
  startError,
  canStart,
  studentName,
  onStudentNameChange,
  onSubmit,
  accessKind,
  hasActiveAttempt = false,
  seatConfirmed,
}) {
  const standalone = accessKind === 'free_standalone' || accessKind === 'paid_standalone';
  const paidUnseated = accessKind === 'paid_standalone' && seatConfirmed === false;
  const fromPath =
    accessKind === 'free_standalone'
      ? `/tests/${slug}?access=free`
      : accessKind === 'paid_standalone'
        ? `/tests/${slug}?access=paid`
        : `/tests/${slug}`;
  const loginHref = `/login?from=${encodeURIComponent(fromPath)}`;
  const registerHref = `/register?from=${encodeURIComponent(fromPath)}`;
  const paidHref = `/paid-tests/${encodeURIComponent(slug)}`;
  const startDisabled = isStarting || !isAuthenticated || canStart === false;

  return (
    <section className="ti-start" aria-labelledby="ti-start-heading">
      <h2 className="visually-hidden" id="ti-start-heading">
        Start test
      </h2>

      {!isAuthenticated ? (
        <div className="ti-callout ti-callout--warn" role="status">
          {standalone
            ? 'Sign in with your student account to start this test. Course enrolment is not required.'
            : 'Sign in with your student account to start this test. Course tests require an active enrolment. We do not start tests without an account.'}{' '}
          <Link to={loginHref}>Go to sign in</Link>
        </div>
      ) : null}

      <form className="ti-start__form" onSubmit={onSubmit} noValidate>
        {isAuthenticated ? (
          <div className="ti-field">
            <label htmlFor="ti-student-name">Your name (optional)</label>
            <input
              id="ti-student-name"
              name="studentName"
              type="text"
              value={studentName}
              onChange={(event) => onStudentNameChange(event.target.value)}
              placeholder="Shows on results if provided"
              autoComplete="name"
              disabled={isStarting}
            />
          </div>
        ) : null}

        {startError ? (
          <p className="ti-form-error" role="alert">
            {startError}
          </p>
        ) : null}

        {paidUnseated && isAuthenticated ? (
          <p className="ti-callout ti-callout--warn" role="status">
            Complete registration and payment first.{' '}
            <Link to={paidHref}>Open paid test registration</Link>
          </p>
        ) : null}

        <button
          type="submit"
          className="btn btn--primary ti-start__button"
          disabled={startDisabled}
          aria-busy={isStarting}
        >
          {isStarting ? 'Starting…' : hasActiveAttempt ? 'Continue test' : 'Start test'}
        </button>
      </form>

      <footer className="ti-start__footer">
        <p>
          New student? <Link to={registerHref}>Create account</Link>
        </p>
        {!isAuthenticated ? (
          <p>
            Have an account? <Link to={loginHref}>Sign in</Link>
          </p>
        ) : null}
        <p>
          <Link to="/" className="ti-link-muted">
            Back to website
          </Link>
        </p>
      </footer>
    </section>
  );
}
