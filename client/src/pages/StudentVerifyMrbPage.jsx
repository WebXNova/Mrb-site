import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import { getStudentToken, setStudentAuth } from '../auth/session';
import PageLayout from '../components/layout/PageLayout';
import AuthBrandHeader from '../components/auth/AuthBrandHeader';
import '../styles/auth-pages.css';

const CODE_MAX_LENGTH = 40;

export default function StudentVerifyMrbPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!getStudentToken()) {
      navigate(`/login?from=${encodeURIComponent('/verify-mrb')}`, { replace: true });
    }
  }, [navigate]);

  function normaliseInput(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '');
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      setError('Please enter your full MRB code.');
      return;
    }
    if (!getStudentToken()) {
      navigate(`/login?from=${encodeURIComponent('/verify-mrb')}`, { replace: true });
      return;
    }
    setIsBusy(true);
    try {
      await studentApi.verifyMrbEnrollment({ code: trimmed });
      const me = await studentApi.me();
      const token = getStudentToken();
      if (me?.data && token) {
        setStudentAuth(token, me.data);
      }
      const from = location.state?.from;
      navigate(typeof from === 'string' && from.startsWith('/') ? from : '/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Verification failed.');
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
          <h1 className="heading-2">MRB enrollment code</h1>
          <p className="auth-subtitle">
            Sign in is not enough: enter the one-time code generated in <strong>Admin → MRB Codes</strong> to open your
            student portal (lectures, tests, doubts). Each code can be used once.
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
                placeholder="e.g. from admin panel"
                autoComplete="one-time-code"
                inputMode="text"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={CODE_MAX_LENGTH}
                aria-invalid={Boolean(error)}
                aria-describedby="mrb-hint"
              />
              <span id="mrb-hint" className="auth-field-hint">
                Letters and digits only (hyphens allowed while typing). Must match an unused admin-generated code.
              </span>
            </div>

            {error ? <p className="admin-error auth-form__error">{error}</p> : null}

            <button className="btn btn--primary auth-form__submit" type="submit" disabled={isBusy}>
              {isBusy ? 'Verifying…' : 'Verify & open portal'}
            </button>
          </form>

          <div className="auth-verify-tip" role="note">
            <p className="auth-verify-tip__title">Where to find your code</p>
            <ul className="auth-verify-tip__list">
              <li>Ask your coordinator for a code from the admin MRB Codes page</li>
              <li>Printed on your MRB enrollment or welcome message</li>
              <li>If the code fails, it may already be used or expired — request a new one</li>
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
