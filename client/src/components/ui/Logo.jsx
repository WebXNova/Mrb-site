import { Link } from 'react-router-dom';
import './Logo.css';

export default function Logo({ to = '/', size = 'md' }) {
  return (
    <Link to={to} className={`logo logo--${size}`} aria-label="MRB Learning home">
      <span className="logo__mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="8" fill="currentColor" />
          <path
            d="M8 22V10L16 18L24 10V22"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="logo__text">
        <span className="logo__name">MRB</span>
        <span className="logo__subtitle">Learning</span>
      </span>
    </Link>
  );
}
