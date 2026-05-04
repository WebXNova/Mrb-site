import { Link } from 'react-router-dom';

/**
 * Logo + official wordmark for auth/unlock flows (matches public site branding paths).
 */
export default function AuthBrandHeader({ subtitle, compact = false }) {
  return (
    <header className={`auth-card-brand ${compact ? 'auth-card-brand--compact' : ''}`}>
      <Link to="/" className="auth-card-brand__link" aria-label="MRB Classes — home">
        <img src="/brand/mrb-logo-icon.png" alt="" className="auth-card-brand__logo" decoding="async" />
        <img
          src="/brand/mrb-logo-wordmark-official.png"
          alt="MRB Classes"
          className="auth-card-brand__wordmark"
          decoding="async"
        />
      </Link>
      {subtitle ? <p className="auth-card-brand__subtitle">{subtitle}</p> : null}
    </header>
  );
}
