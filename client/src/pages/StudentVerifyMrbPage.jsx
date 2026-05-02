import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import AuthBrandHeader from '../components/auth/AuthBrandHeader';
import '../styles/auth-pages.css';

const CODE_MAX_LENGTH = 40;

export default function StudentVerifyMrbPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const navigate = useNavigate();

  function normaliseInput(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '');
  }

  function onSubmit(event) {
    event.preventDefault();
    setError('');
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      setError('Please enter your full MRB code.');
      return;
    }
    setIsBusy(true);
    try {
      // Placeholder until backend verification is wired; keeps navigation behavior.
      navigate('/dashboard', { replace: true });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <PageLayout>
      <section className="auth-shell auth-shell--verify">
        <div className="auth-card auth-card--verify">
          <AuthBrandHeader subtitle="Official MRB Classes student access" compact />
          <p className="auth-card__eyebrow">Student access</p>
          <h1 className="heading-2">Enter MRB code</h1>
          <p className="auth-subtitle">
            Use the enrollment code from MRB Classes to activate your materials. Paste or type carefully—letters are
            not case-sensitive.
          </p>

          <form onSubmit={onSubmit} className="auth-form auth-form--verify" noValidate>
            <div className="admin-field">
              <label htmlFor="mrbCode">MRB code</label>
              <input
                id="mrbCode"
                className="auth-mrb-code-input"
                name="mrbCode"
                value={code}
                onChange={(event) => setCode(normaliseInput(event.target.value))}
                placeholder="e.g. MRB-A1B2-C3D4"
                autoComplete="one-time-code"
                inputMode="text"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={CODE_MAX_LENGTH}
                aria-invalid={Boolean(error)}
                aria-describedby="mrb-hint"
              />
              <span id="mrb-hint" className="auth-field-hint">
                Alphanumeric characters and hyphen only. Spaces are removed automatically.
              </span>
            </div>

            {error ? <p className="admin-error auth-form__error">{error}</p> : null}

            <button className="btn btn--primary auth-form__submit" type="submit" disabled={isBusy}>
              {isBusy ? 'Verifying…' : 'Verify & continue'}
            </button>
          </form>

          <div className="auth-verify-tip" role="note">
            <p className="auth-verify-tip__title">Where to find your code</p>
            <ul className="auth-verify-tip__list">
              <li>Printed on your MRB enrollment or welcome message</li>
              <li>Sent by email when you enroll in a programme</li>
              <li>Ask support if your code expired or fails here</li>
            </ul>
          </div>

          <p className="auth-footer">
            New student? <Link to="/register">Create account</Link>
          </p>
          <p className="auth-footer auth-footer--compact">
            Already registered? <Link to="/login">Sign in</Link>
          </p>
          <p className="auth-footer auth-footer--compact">
            <Link to="/" className="auth-footer-link--muted">
              Back to website
            </Link>
          </p>
        </div>
      </section>
    </PageLayout>
  );
}
