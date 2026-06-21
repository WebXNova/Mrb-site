import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import { clearAllAuth } from '../auth/session';
import PageLayout from '../components/layout/PageLayout';
import AuthBrandHeader from '../components/auth/AuthBrandHeader';
import { PASSWORD_REQUIREMENTS, validateStudentPassword } from '../utils/studentPasswordPolicy';
import '../styles/auth-pages.css';

const GENERIC_INVALID_TOKEN_MESSAGE = 'Invalid or expired reset link.';
const GENERIC_SUCCESS_MESSAGE =
  'Password updated successfully. Please sign in again. For security, you were signed out of all devices.';

function readTokenFromLocation() {
  const queryToken = new URLSearchParams(window.location.search || '').get('token');
  return queryToken ? String(queryToken).trim() : '';
}

function isValidTokenShape(token) {
  return /^[a-f0-9]{64}$/i.test(String(token || '').trim());
}

function scrubTokenFromLocation() {
  if (typeof window === 'undefined') return;
  window.history.replaceState({}, document.title, window.location.pathname);
}

/** Survives React StrictMode remount after URL scrub (same sync-capture idea as VerifyEmailPage). */
let resetTokenSnapshot;

function captureResetTokenOnce() {
  const rawFromUrl = readTokenFromLocation();
  if (rawFromUrl) {
    resetTokenSnapshot = isValidTokenShape(rawFromUrl) ? rawFromUrl.toLowerCase() : '';
    return resetTokenSnapshot;
  }
  if (resetTokenSnapshot !== undefined) {
    return resetTokenSnapshot;
  }
  resetTokenSnapshot = '';
  return resetTokenSnapshot;
}

function clearResetTokenSnapshot() {
  resetTokenSnapshot = undefined;
}

function mapResetPasswordError(error) {
  const status = Number(error?.status || 0);
  if (status === 400) {
    return GENERIC_INVALID_TOKEN_MESSAGE;
  }
  if (status === 422) {
    const message = typeof error?.message === 'string' ? error.message.trim() : '';
    if (message && !/\btoken\b/i.test(message)) {
      return message;
    }
    return 'Please check your password and try again.';
  }
  if (status === 429) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  if (status === 503 || status === 408) {
    return 'Service temporarily unavailable. Please try again shortly.';
  }
  return 'Unable to reset your password right now. Please try again later.';
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggleVisible,
  describedBy,
  invalid,
  disabled,
  autoComplete,
}) {
  return (
    <div className="admin-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password-field">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          required
          aria-invalid={invalid ? 'true' : 'false'}
          aria-describedby={describedBy}
          disabled={disabled}
        />
        <button
          type="button"
          className="auth-password-field__toggle"
          onClick={onToggleVisible}
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          disabled={disabled}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}

export default function StudentResetPasswordPage() {
  const token = useMemo(() => captureResetTokenOnce(), []);
  const tokenRef = useRef(token);
  const scrubbedRef = useRef(false);
  const [tokenState, setTokenState] = useState(() => (token ? 'ready' : 'invalid'));
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (scrubbedRef.current || !token) return;
    scrubbedRef.current = true;
    scrubTokenFromLocation();
  }, [token]);

  async function onSubmit(event) {
    event.preventDefault();
    if (isBusy || tokenState !== 'ready') return;

    setFieldError('');
    setSubmitError('');

    if (!password) {
      setFieldError('Enter a new password.');
      return;
    }
    if (!confirmPassword) {
      setFieldError('Confirm your new password.');
      return;
    }

    const passwordError = validateStudentPassword(password);
    if (passwordError) {
      setFieldError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setFieldError('Passwords do not match.');
      return;
    }

    setIsBusy(true);
    try {
      const response = await studentApi.resetPassword({
        token: tokenRef.current,
        password,
        confirmPassword,
      });
      const message =
        typeof response?.data?.message === 'string' && response.data.message.trim()
          ? response.data.message.trim()
          : GENERIC_SUCCESS_MESSAGE;
      tokenRef.current = '';
      clearResetTokenSnapshot();
      setTokenState('success');
      setPassword('');
      setConfirmPassword('');
      setSuccessMessage(message);
      clearAllAuth();
    } catch (error) {
      const message = mapResetPasswordError(error);
      setSubmitError(message);
      if (Number(error?.status || 0) === 400) {
        tokenRef.current = '';
        clearResetTokenSnapshot();
        setTokenState('invalid');
        setPassword('');
        setConfirmPassword('');
      }
    } finally {
      setIsBusy(false);
    }
  }

  if (tokenState === 'invalid') {
    return (
      <PageLayout>
        <section className="auth-shell">
          <div className="auth-card auth-card--reset">
            <AuthBrandHeader subtitle="Student account" compact />
            <h1 className="heading-2" id="reset-password-title">
              Reset password
            </h1>
            <div className="auth-form" role="alert" aria-labelledby="reset-password-title">
              <p className="admin-error auth-form__error">{GENERIC_INVALID_TOKEN_MESSAGE}</p>
              <p className="auth-field-hint">
                Request a new reset link if this one has expired or was already used.
              </p>
              <Link className="btn btn--primary auth-form__submit" to="/forgot-password">
                Forgot password
              </Link>
              <Link className="btn btn--secondary auth-form__submit" to="/login">
                Back to sign in
              </Link>
            </div>
          </div>
        </section>
      </PageLayout>
    );
  }

  if (tokenState === 'success') {
    return (
      <PageLayout>
        <section className="auth-shell">
          <div className="auth-card auth-card--reset">
            <AuthBrandHeader subtitle="Student account" compact />
            <h1 className="heading-2" id="reset-password-title">
              Reset password
            </h1>
            <div className="auth-form" role="status" aria-live="polite" aria-labelledby="reset-password-title">
              <p className="admin-success auth-form__status">{successMessage}</p>
              <Link className="btn btn--primary auth-form__submit" to="/login">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <section className="auth-shell">
        <div className="auth-card auth-card--reset">
          <AuthBrandHeader subtitle="Student account" compact />
          <h1 className="heading-2" id="reset-password-title">
            Reset password
          </h1>
          <p className="auth-subtitle">Choose a new password for your student account.</p>

          <form
            onSubmit={onSubmit}
            className="auth-form"
            aria-labelledby="reset-password-title"
            aria-busy={isBusy}
            noValidate
          >
            <PasswordField
              id="newPassword"
              label="New password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (fieldError) setFieldError('');
                if (submitError) setSubmitError('');
              }}
              visible={showPassword}
              onToggleVisible={() => setShowPassword((value) => !value)}
              describedBy="reset-password-requirements"
              invalid={Boolean(fieldError)}
              disabled={isBusy}
              autoComplete="new-password"
            />

            <div className="auth-verify-tip" id="reset-password-requirements">
              <p className="auth-verify-tip__title">Password requirements</p>
              <ul className="auth-verify-tip__list">
                {PASSWORD_REQUIREMENTS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <PasswordField
              id="confirmPassword"
              label="Confirm password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                if (fieldError) setFieldError('');
                if (submitError) setSubmitError('');
              }}
              visible={showConfirmPassword}
              onToggleVisible={() => setShowConfirmPassword((value) => !value)}
              describedBy="reset-password-requirements"
              invalid={Boolean(fieldError)}
              disabled={isBusy}
              autoComplete="new-password"
            />

            {fieldError ? (
              <p className="admin-error auth-form__error" role="alert">
                {fieldError}
              </p>
            ) : null}

            {submitError ? (
              <p className="admin-error auth-form__error" role="alert">
                {submitError}
              </p>
            ) : null}

            <button className="btn btn--primary auth-form__submit" type="submit" disabled={isBusy}>
              {isBusy ? 'Resetting…' : 'Reset password'}
            </button>
          </form>

          <p className="auth-footer">
            Back to <Link to="/login">Sign in</Link>
          </p>
        </div>
      </section>
    </PageLayout>
  );
}
