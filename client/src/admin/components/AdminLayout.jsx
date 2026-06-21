import { adminRoute } from '../../config/adminPaths';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { adminApi } from '../../api/adminApi';
import { clearAdminAuth, broadcastRoleLogout, getStoredUser } from '../../auth/session';
import { AdminToastProvider } from '../context/AdminToastContext';
import { useIsMobileNav } from '../hooks/useMediaQuery';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { getAdminNavItems, buildAdminBreadcrumbs } from '../config/adminNavConfig';
import { MRB_LOGO_WORDMARK_SRC } from '../../components/brand/MrbEmblemImage';
import '../../styles/global.css';
import '../styles/admin.css';
import '../styles/admin-tests.css';
import '../styles/admin-responsive.css';
import '../styles/admin-shell-v2.css';
import AdminToastContainer from './AdminToastContainer';
import AdminBreadcrumbs from './AdminBreadcrumbs';

function AdminShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const adminUser = getStoredUser('admin_user');
  const isMobileNav = useIsMobileNav();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorageState('mrb_admin_sidebar_collapsed', false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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

  const initials = (adminUser?.fullName || adminUser?.email || 'A')
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

          <div className="admin-topbar__search">
            <div className="admin-topbar-search">
              <span className="admin-topbar-search__icon" aria-hidden>
                <SearchOutlinedIcon fontSize="small" />
              </span>
              <input
                type="search"
                className="admin-topbar-search__input"
                placeholder="Search admin…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search admin"
              />
            </div>
          </div>

          <div className="admin-topbar__actions">
            <button type="button" className="admin-topbar-icon-btn" aria-label="Notifications">
              <NotificationsNoneOutlinedIcon fontSize="small" />
            </button>

            <div className="admin-profile-menu" ref={profileRef}>
              <button
                type="button"
                className="admin-profile-menu__trigger"
                onClick={() => setProfileOpen((o) => !o)}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
              >
                <span className="admin-profile-menu__avatar" aria-hidden>
                  {initials}
                </span>
                <span className="admin-profile-menu__meta">
                  <span className="admin-profile-menu__name">{adminUser?.fullName || adminUser?.email || 'Admin'}</span>
                  <span className="admin-profile-menu__role">{adminUser?.role || 'administrator'}</span>
                </span>
              </button>
              {profileOpen ? (
                <div className="admin-profile-menu__panel" role="menu">
                  <button type="button" className="admin-profile-menu__item" role="menuitem" onClick={() => navigate(adminRoute('settings'))}>
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
    <AdminToastProvider>
      <AdminShell />
    </AdminToastProvider>
  );
}
