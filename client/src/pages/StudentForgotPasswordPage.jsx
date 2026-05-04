import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import '../styles/auth-pages.css';

export default function StudentForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  function onSubmit(event) {
    event.preventDefault();
    setSent(true);
  }

  return (
    <PageLayout>
      <section className="auth-shell">
        <div className="auth-card auth-card--forgot">
          <h1 className="heading-2">Forgot Password</h1>
          <p className="auth-subtitle">UI ready. Backend reset flow will be connected later.</p>
          <form onSubmit={onSubmit} className="auth-form">
            <div className="admin-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <button className="btn btn--primary auth-form__submit" type="submit">
              Send Reset Link
            </button>
          </form>
          {sent ? (
            <p className="admin-success auth-form__status">
              Reset link request captured. Continue to <Link to="/reset-password">Reset Password</Link>.
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
