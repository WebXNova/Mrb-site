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
}) {
  const loginHref = `/login?from=${encodeURIComponent(`/tests/${slug}`)}`;
  const registerHref = `/register?from=${encodeURIComponent(`/tests/${slug}`)}`;
  const startDisabled = isStarting || !isAuthenticated || canStart === false;

  return (
    <section className="ti-start" aria-labelledby="ti-start-heading">
      <h2 className="visually-hidden" id="ti-start-heading">
        Start test
      </h2>

      {!isAuthenticated ? (
        <div className="ti-callout ti-callout--warn" role="status">
          Sign in with your student account to start this test.{' '}
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

        <button
          type="submit"
          className="btn btn--primary ti-start__button"
          disabled={startDisabled}
          aria-busy={isStarting}
        >
          {isStarting ? 'Starting…' : 'Start test'}
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
