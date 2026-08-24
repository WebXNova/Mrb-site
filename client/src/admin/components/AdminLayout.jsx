import { adminRoute } from '../../config/adminPaths';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import { adminApi } from '../../api/adminApi';
import { clearAdminAuth, broadcastRoleLogout, getStoredUser } from '../../auth/session';
import { AdminToastProvider } from '../context/AdminToastContext';
import { useIsMobileNav } from '../hooks/useMediaQuery';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { getAdminNavItems, buildAdminBreadcrumbs } from '../config/adminNavConfig';
import { MRB_LOGO_WORDMARK_SRC } from '../../components/brand/MrbEmblemImage';
import '../../styles/global.css';
import '../styles/admin-theme.css';
import '../styles/admin.css';
import '../styles/admin-tests.css';
import '../styles/admin-responsive.css';
import '../styles/admin-shell-v2.css';
import '../styles/admin-density.css';
import '../styles/admin-layout-cleanup.css';
import '../styles/admin-course-edit-layout.css';
import '../styles/admin-theme-overrides.css';
import '../styles/admin-premium-forms.css';
import { AdminThemeProvider, useAdminTheme } from '../context/AdminThemeContext';
import AdminToastContainer from './AdminToastContainer';
import AdminBreadcrumbs from './AdminBreadcrumbs';

function AdminShell() {
  const { theme, toggleTheme, isDark } = useAdminTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const adminUser = getStoredUser('admin_user');
  const isMobileNav = useIsMobileNav();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorageState('mrb_admin_sidebar_collapsed', false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const breadcrumbs = buildAdminBreadcrumbs(location.pathname);
  const pageTitle = breadcrumbs[breadcrumbs.length - 1]?.label || 'Admin';

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
      if (event.key === 'Escape') {
        if (mobileNavOpen) setMobileNavOpen(false);
        if (profileOpen) setProfileOpen(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileNavOpen, profileOpen]);

  useEffect(() => {
    function onDocClick(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    }
    if (profileOpen) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [profileOpen]);

  async function handleLogout() {
    try {
      await adminApi.logout();
    } catch {
      /* ignore */
    }
    clearAdminAuth();
    broadcastRoleLogout('admin');
    navigate(adminRoute('login'));
  }

  const displayName = adminUser?.fullName || adminUser?.username || 'Admin';
  const email = adminUser?.email || '—';
  const username = adminUser?.username || adminUser?.fullName || 'Admin';

  const initials = (displayName || email || 'A')
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  return (
    <div
      className={`admin-shell${mobileNavOpen ? ' admin-shell--nav-open' : ''}${
        sidebarCollapsed && !isMobileNav ? ' admin-shell--sidebar-collapsed' : ''
      }`}
      data-admin-theme={theme}
    >
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
          <img src={MRB_LOGO_WORDMARK_SRC} alt="MRB Classes" className="admin-brand__logo" />
          <div className="admin-brand__text">
            <p className="admin-brand__title">MRB Admin</p>
            <p className="admin-brand__subtitle">Control Center</p>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Main">
          {getAdminNavItems().map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `admin-nav__item ${isActive ? 'admin-nav__item--active' : ''}`}
              onClick={() => setMobileNavOpen(false)}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <span className="admin-nav__icon" aria-hidden>
                <item.Icon fontSize="small" />
              </span>
              <span className="admin-nav__label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {!isMobileNav ? (
          <div className="admin-sidebar__footer">
            <button
              type="button"
              className="admin-sidebar-collapse-btn"
              onClick={() => setSidebarCollapsed((v) => !v)}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
              <span className="admin-sidebar-collapse-btn__label">
                {sidebarCollapsed ? 'Expand' : 'Collapse'}
              </span>
            </button>
          </div>
        ) : null}
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
            <div style={{ minWidth: 0 }}>
              <AdminBreadcrumbs items={breadcrumbs} />
              <p className="admin-topbar__title">{pageTitle}</p>
            </div>
          </div>

          <div className="admin-topbar__actions">
            <button
              type="button"
              className="admin-topbar-icon-btn"
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Light mode' : 'Dark mode'}
            >
              {isDark ? (
                <LightModeOutlinedIcon fontSize="small" />
              ) : (
                <DarkModeOutlinedIcon fontSize="small" />
              )}
            </button>
            <div className="admin-profile-menu" ref={profileRef}>
              <button
                type="button"
                className="admin-profile-menu__trigger"
                onClick={() => setProfileOpen((o) => !o)}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                aria-label={`Account menu for ${displayName}`}
              >
                <span className="admin-profile-menu__avatar" aria-hidden>
                  {initials}
                </span>
              </button>
              {profileOpen ? (
                <div className="admin-profile-menu__panel" role="menu" aria-label="Admin account menu">
                  <header className="admin-profile-menu__header">
                    <span className="admin-profile-menu__avatar admin-profile-menu__avatar--lg" aria-hidden>
                      {initials}
                    </span>
                    <p className="admin-profile-menu__name">{username}</p>
                    <p className="admin-profile-menu__email">{email}</p>
                  </header>
                  <div className="admin-profile-menu__divider" aria-hidden />
                  <div className="admin-profile-menu__items">
                    <button
                      type="button"
                      className="admin-profile-menu__item"
                      role="menuitem"
                      onClick={() => {
                        setProfileOpen(false);
                        navigate(adminRoute('settings'));
                      }}
                    >
                      Settings
                    </button>
                    <button
                      type="button"
                      className="admin-profile-menu__item admin-profile-menu__item--danger"
                      role="menuitem"
                      onClick={handleLogout}
                    >
                      Log out
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <Outlet />
      </section>

      <AdminToastContainer />
    </div>
  );
}

export default function AdminLayout() {
  return (
    <AdminThemeProvider>
      <AdminToastProvider>
        <AdminShell />
      </AdminToastProvider>
    </AdminThemeProvider>
  );
}
