import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { clearAdminAuth, getStoredUser } from '../../auth/session';
import '../../styles/global.css';
import '../styles/admin.css';

const navItems = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/questions', label: 'Questions' },
  { to: '/admin/courses', label: 'Courses' },
  { to: '/admin/lectures', label: 'Lectures' },
  { to: '/admin/tests', label: 'Tests' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/mrb-codes', label: 'MRB Codes' },
  { to: '/admin/logs', label: 'Logs' },
  { to: '/admin/settings', label: 'Settings' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const adminUser = getStoredUser('admin_user');

  async function handleLogout() {
    try {
      await adminApi.logout();
    } catch {
      // Ignore logout API failure and proceed locally.
    }
    clearAdminAuth();
    navigate('/admin/login');
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <img src="/brand/mrb-logo-wordmark-official.png" alt="MRB Classes" className="admin-brand__logo" />
          <div>
            <p className="admin-brand__title">MRB Admin</p>
            <p className="admin-brand__subtitle">Control Center</p>
          </div>
        </div>

        <nav className="admin-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `admin-nav__item ${isActive ? 'admin-nav__item--active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <section className="admin-content">
        <header className="admin-topbar">
          <div>
            <p className="admin-topbar__title">Admin Panel</p>
            <p className="admin-topbar__subtitle">
              Manage questions, courses, lectures, tests, users, logs, and access
            </p>
            {adminUser?.email ? (
              <p className="admin-topbar__subtitle">
                Signed in as {adminUser.fullName || adminUser.email} ({adminUser.role})
              </p>
            ) : null}
          </div>
          <button className="btn btn--secondary btn--sm" onClick={handleLogout} type="button">
            Logout
          </button>
        </header>

        <Outlet />
      </section>
    </div>
  );
}
