import { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/auth-pages.css';

export default function StudentForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  function onSubmit(event) {
    event.preventDefault();
    setSent(true);
  }

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <h1 className="heading-2">Forgot Password</h1>
        <p className="auth-subtitle">UI ready. Backend reset flow will be connected later.</p>
        <form onSubmit={onSubmit} style={{ marginTop: '1rem' }}>
          <div className="admin-field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <button className="btn btn--primary" type="submit" style={{ marginTop: '1rem' }}>
            Send Reset Link
          </button>
        </form>
        {sent ? <p className="admin-success" style={{ marginTop: '0.75rem' }}>Reset link request captured.</p> : null}
        <p className="auth-footer">
          Back to <Link to="/login">Sign in</Link>
        </p>
      </div>
    </section>
  );
}
