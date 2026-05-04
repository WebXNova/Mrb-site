import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import '../styles/auth-pages.css';

export default function StudentResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(false);

  function onSubmit(event) {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setUpdated(true);
    setPassword('');
    setConfirmPassword('');
  }

  return (
    <PageLayout>
      <section className="auth-shell">
        <div className="auth-card auth-card--reset">
          <h1 className="heading-2">Reset Password</h1>
          <p className="auth-subtitle">
            Set a new secure password to continue with your student account.
          </p>

          <form onSubmit={onSubmit} className="auth-form">
            <div className="admin-field">
              <label htmlFor="newPassword">New Password</label>
              <input
                id="newPassword"
                type="password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            <div className="admin-field">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>

            {error ? <p className="admin-error auth-form__error">{error}</p> : null}
            <button className="btn btn--primary auth-form__submit" type="submit">
              Update Password
            </button>
          </form>

          {updated ? (
            <p className="admin-success auth-form__status">
              Password updated in UI flow. Connect this screen to backend reset API next.
            </p>
          ) : null}

          <p className="auth-footer">
            Back to <Link to="/login">Sign in</Link>
          </p>
        </div>
      </section>
    </PageLayout>
  );
}
