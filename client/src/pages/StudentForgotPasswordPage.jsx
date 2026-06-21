import { useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import PageLayout from '../components/layout/PageLayout';
import AuthBrandHeader from '../components/auth/AuthBrandHeader';
import '../styles/auth-pages.css';

const GENERIC_SUCCESS_MESSAGE =
  'If an account exists for that email address, we sent a password reset link. Check your inbox and spam folder. The link expires after a short time and can only be used once.';

function isValidEmail(value) {
  const trimmed = String(value || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function mapForgotPasswordError(error) {
  const status = Number(error?.status || 0);
  if (status === 429) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  if (status === 503 || status === 408) {
    return 'Service temporarily unavailable. Please try again shortly.';
  }
  return 'Unable to send the reset link right now. Please try again later.';
}

export default function StudentForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (isBusy) return;

    const trimmedEmail = email.trim();
    setFieldError('');
    setSubmitError('');

    if (!trimmedEmail) {
      setFieldError('Enter your email address.');
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setFieldError('Enter a valid email address.');
      return;
    }

    setIsBusy(true);
    try {
      const response = await studentApi.forgotPassword({ email: trimmedEmail.toLowerCase() });
      const message =
        typeof response?.data?.message === 'string' && response.data.message.trim()
          ? response.data.message.trim()
          : GENERIC_SUCCESS_MESSAGE;
      setSuccessMessage(message);
      setSubmitted(true);
    } catch (error) {
      setSubmitError(mapForgotPasswordError(error));
    } finally {
      setIsBusy(false);
    }
  }

  function onTryAnotherEmail() {
    setSubmitted(false);
    setSuccessMessage('');
    setSubmitError('');
    setFieldError('');
    setEmail('');
  }

  return (
    <PageLayout>
      <section className="auth-shell">
        <div className="auth-card auth-card--forgot">
          <AuthBrandHeader subtitle="Student account" compact />
          <h1 className="heading-2" id="forgot-password-title">
            Forgot password
          </h1>
          <p className="auth-subtitle">
            Enter the email address for your student account. If it matches an account, we will send a
            link to reset your password.
          </p>

          {submitted ? (
            <div className="auth-form" role="status" aria-live="polite" aria-labelledby="forgot-password-title">
              <p className="admin-success auth-form__status">{successMessage}</p>
              <p className="auth-field-hint">
                Didn&apos;t receive it? Check your spam folder or wait a few minutes before requesting
                again.
              </p>
              <button type="button" className="btn btn--secondary auth-form__submit" onClick={onTryAnotherEmail}>
                Use a different email
              </button>
              <Link className="btn btn--primary auth-form__submit" to="/login">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form
              onSubmit={onSubmit}
              className="auth-form"
              aria-labelledby="forgot-password-title"
              aria-busy={isBusy}
              noValidate
            >
              <div className="admin-field">
                <label htmlFor="forgot-email">Email address</label>
                <input
                  id="forgot-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (fieldError) setFieldError('');
                    if (submitError) setSubmitError('');
                  }}
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  aria-invalid={fieldError ? 'true' : 'false'}
                  aria-describedby={fieldError ? 'forgot-email-error' : 'forgot-email-hint'}
                  disabled={isBusy}
                />
                <span id="forgot-email-hint" className="auth-field-hint">
                  For your security, we cannot confirm whether an email address is registered.
                </span>
                {fieldError ? (
                  <p id="forgot-email-error" className="admin-error auth-form__error" role="alert">
                    {fieldError}
                  </p>
                ) : null}
              </div>

              {submitError ? (
                <p className="admin-error auth-form__error" role="alert">
                  {submitError}
                </p>
              ) : null}

              <button className="btn btn--primary auth-form__submit" type="submit" disabled={isBusy}>
                {isBusy ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}

          {!submitted ? (
            <p className="auth-footer">
              Back to <Link to="/login">Sign in</Link>
            </p>
          ) : null}
        </div>
      </section>
    </PageLayout>
  );
}
