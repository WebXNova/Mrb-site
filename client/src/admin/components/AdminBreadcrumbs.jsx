import { Link } from 'react-router-dom';

export default function AdminBreadcrumbs({ items }) {
  if (!items?.length) return null;
  return (
    <nav className="admin-breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            {i > 0 ? <span className="admin-breadcrumbs__sep" aria-hidden>/</span> : null}
            {item.to && !isLast ? (
              <Link className="admin-breadcrumbs__link" to={item.to}>
                {item.label}
              </Link>
            ) : (
              <span aria-current={isLast ? 'page' : undefined}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
