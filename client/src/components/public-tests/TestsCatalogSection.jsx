import { Link } from 'react-router-dom';
import './TestsCatalogSection.css';

export default function TestsCatalogSection({
  id,
  eyebrow,
  title,
  titleId,
  lead,
  viewAllTo,
  viewAllLabel,
  alt = false,
  children,
}) {
  return (
    <section
      id={id}
      className={`tests-catalog${alt ? ' tests-catalog--alt' : ''}`}
      aria-labelledby={titleId}
    >
      <div className="container">
        <header className="tests-catalog__head">
          <div className="tests-catalog__head-copy">
            {eyebrow ? <span className="eyebrow tests-catalog__eyebrow">{eyebrow}</span> : null}
            <h2 id={titleId} className="heading-2 tests-catalog__title">
              {title}
            </h2>
            {lead ? <p className="body-md tests-catalog__lead">{lead}</p> : null}
          </div>
          {viewAllTo && viewAllLabel ? (
            <Link to={viewAllTo} className="tests-catalog__view-all">
              {viewAllLabel}
              <span aria-hidden="true">→</span>
            </Link>
          ) : null}
        </header>
        {children}
      </div>
    </section>
  );
}
