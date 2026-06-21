import { Link } from 'react-router-dom';
import MrbEmblemImage from '../brand/MrbEmblemImage';
import './Logo.css';

export default function Logo({ to = '/', size = 'md' }) {
  return (
    <Link to={to} className={`logo logo--${size}`} aria-label="MRB Classes home">
      <span className="logo__mark" aria-hidden="true">
        <MrbEmblemImage alt="MRB Classes - MDCAT Toppers Platform" loading="lazy" />
      </span>
      <span className="logo__text">
        <span className="logo__name">MRB</span>
        <span className="logo__subtitle">Classes</span>
      </span>
    </Link>
  );
}
