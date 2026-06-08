import { Link } from 'react-router-dom';

export default function AdminTestPageHeader({
  title,
  subtitle,
  backTo = '/admin/tests',
  backLabel = 'Back to Tests',
  previousTo,
  previousLabel = 'Previous',
  children,
}) {
  return (
    <header className="admin-test-page-header">
      <div>
        <h1 className="admin-test-page-header__title">{title}</h1>
        {subtitle ? <p className="admin-test-page-header__subtitle">{subtitle}</p> : null}
      </div>
      <div className="admin-test-page-header__actions">
        {children}
        {previousTo ? (
          <Link className="btn btn--secondary" to={previousTo}>
            ← {previousLabel}
          </Link>
        ) : null}
        <Link className="btn btn--secondary" to={backTo}>
          {backLabel}
        </Link>
      </div>
    </header>
  );
}
