import { Link } from 'react-router-dom';
import MrbEmblemImage, { MRB_LOGO_WORDMARK_SRC } from '../brand/MrbEmblemImage';

/**
 * Logo lockup for auth flows — aligned with the public navbar brand treatment.
 */
export default function AuthBrandHeader({ subtitle, compact = false }) {
  return (
    <header className={`auth-card-brand ${compact ? 'auth-card-brand--compact' : ''}`}>
      <Link to="/" className="auth-card-brand__link" aria-label="MRB Classes — home">
        <span className="auth-card-brand__lockup">
          <MrbEmblemImage
            className="auth-card-brand__logo"
            width={48}
            height={48}
          />
          <img
            src={MRB_LOGO_WORDMARK_SRC}
            alt="MRB Classes"
            className="auth-card-brand__wordmark"
            width={160}
            height={40}
            decoding="async"
          />
        </span>
      </Link>
      {subtitle ? <p className="auth-card-brand__subtitle">{subtitle}</p> : null}
    </header>
  );
}
