import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { clearAdminAuth, getStoredUser } from '../../auth/session';
import { AdminToastProvider } from '../context/AdminToastContext';
import { useIsMobileNav } from '../hooks/useMediaQuery';
import '../../styles/global.css';
import '../styles/admin.css';
import '../styles/admin-tests.css';
import '../styles/admin-responsive.css';
import AdminToastContainer from './AdminToastContainer';

const navItems = [
  { to: '/admin', label: 'Dashboard', end: true, icon: 'D' },
  { to: '/admin/question-bank/new', label: 'Question Bank', icon: 'B' },
  { to: '/admin/questions', label: 'Student Q&A', icon: 'Q' },
  { to: '/admin/courses', label: 'Courses', icon: 'C' },
  { to: '/admin/chapters', label: 'Chapters', icon: 'H' },
  { to: '/admin/lectures', label: 'Lectures', icon: 'L' },
  { to: '/admin/tests', label: 'Tests', icon: 'T' },
  { to: '/admin/users', label: 'Users', icon: 'U' },
  { to: '/admin/remarks', label: 'Remarks', icon: 'R' },
  { to: '/admin/registrations', label: 'Registrations', icon: 'N' },
  { to: '/admin/logs', label: 'Logs', icon: 'G' },
  { to: '/admin/settings', label: 'Settings', icon: 'S' },
];

function AdminShell() {
  const navigate = useNavigate();
  const adminUser = getStoredUser('admin_user');
  const isMobileNav = useIsMobileNav();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!isMobileNav) setMobileNavOpen(false);
  }, [isMobileNav]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape' && mobileNavOpen) setMobileNavOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileNavOpen]);

  async function handleLogout() {
    try {
      await adminApi.logout();
    } catch {
      /* ignore */
    }
    clearAdminAuth();
    navigate('/admin/login');
  }

  return (
    <div className={`admin-shell${mobileNavOpen ? ' admin-shell--nav-open' : ''}`}>
      {isMobileNav && mobileNavOpen ? (
        <button
          type="button"
          className="admin-sidebar-overlay"
          aria-label="Close navigation menu"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <aside id="admin-sidebar-nav" className="admin-sidebar" aria-label="Admin navigation">
        <div className="admin-brand">
          <img src="/brand/mrb-logo-wordmark-official.png" alt="MRB Classes" className="admin-brand__logo" />
          <div>
            <p className="admin-brand__title">MRB Admin</p>
            <p className="admin-brand__subtitle">Control Center</p>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Main">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `admin-nav__item ${isActive ? 'admin-nav__item--active' : ''}`
              }
              onClick={() => setMobileNavOpen(false)}
            >
              <span className="admin-nav__icon" aria-hidden>
                {item.icon}
              </span>
              <span className="admin-nav__label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <section className="admin-content">
        <header className="admin-topbar">
          <div className="admin-topbar__start">
            {isMobileNav ? (
              <button
                type="button"
                className="admin-nav-toggle admin-touch-target"
                aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileNavOpen}
                aria-controls="admin-sidebar-nav"
                onClick={() => setMobileNavOpen((open) => !open)}
              >
                <span className="admin-nav-toggle__bar" />
                <span className="admin-nav-toggle__bar" />
                <span className="admin-nav-toggle__bar" />
              </button>
            ) : null}
            <div>
              <p className="admin-topbar__title">Admin Panel</p>
              <p className="admin-topbar__subtitle admin-topbar__subtitle--hide-mobile">
                Manage questions, courses, lectures, tests, registrations, users, logs, and access
              </p>
              {adminUser?.email ? (
                <p className="admin-topbar__subtitle">
                  Signed in as {adminUser.fullName || adminUser.email} ({adminUser.role})
                </p>
              ) : null}
            </div>
          </div>
          <button className="btn btn--secondary btn--sm admin-touch-target" onClick={handleLogout} type="button">
            Logout
          </button>
        </header>

        <Outlet />
      </section>

      <AdminToastContainer />
    </div>
  );
}

export default function AdminLayout() {
  return (
    <AdminToastProvider>
      <AdminShell />
    </AdminToastProvider>
  );
}
