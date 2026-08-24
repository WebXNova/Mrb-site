import { adminRoute } from '../../config/adminPaths';
import { Link } from 'react-router-dom';

export default function AdminTestPageHeader({
  title,
  subtitle,
  backTo = adminRoute('tests'),
  backLabel = 'Back to Tests',
  backVariant = 'button',
  previousTo,
  previousLabel = 'Previous',
  children,
}) {
  const backClassName =
    backVariant === 'link'
      ? 'admin-test-page-header__back-link'
      : 'btn btn--secondary';

  return (
    <header className="admin-test-page-header">
      <div className="admin-test-page-header__main">
        {backLabel && backVariant === 'link' ? (
          <Link className={backClassName} to={backTo}>
            ← {backLabel}
          </Link>
        ) : null}
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
        {backLabel && backVariant === 'button' ? (
          <Link className={backClassName} to={backTo}>
            {backLabel}
          </Link>
        ) : null}
      </div>
    </header>
  );
}
