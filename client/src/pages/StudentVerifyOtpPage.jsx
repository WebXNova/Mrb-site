import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import '../styles/auth-pages.css';

export default function StudentVerifyOtpPage() {
  const [otp, setOtp] = useState('');
  const navigate = useNavigate();

  function onSubmit(event) {
    event.preventDefault();
    navigate('/verify-mrb');
  }

  return (
    <PageLayout>
      <section className="auth-shell">
        <div className="auth-card auth-card--verify">
          <h1 className="heading-2">Verify Email</h1>
          <p className="auth-subtitle">Enter the 6-digit OTP sent to your email.</p>
          <form onSubmit={onSubmit} className="auth-form">
            <div className="admin-field">
              <label htmlFor="otp">OTP Code</label>
              <input id="otp" value={otp} onChange={(event) => setOtp(event.target.value)} maxLength={6} required />
            </div>
            <button className="btn btn--primary auth-form__submit" type="submit">
              Verify OTP
            </button>
          </form>
          <p className="auth-footer">
            Didn&apos;t receive code? <Link to="/register">Resend</Link>
          </p>
        </div>
      </section>
    </PageLayout>
  );
}
