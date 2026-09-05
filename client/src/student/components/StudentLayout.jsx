import { useEffect } from 'react';
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { studentApi } from '../../api/studentApi';
import { clearStudentAuth, broadcastRoleLogout } from '../../auth/session';
import MrbEmblemImage, { MRB_LOGO_WORDMARK_SRC } from '../../components/brand/MrbEmblemImage';
import { StudentThemeProvider } from '../context/StudentThemeContext';
import { getStudentPageTitle, studentBottomNavItems, studentNavItems } from '../config/studentNavConfig';
import { useIsStudentMobileNav } from '../hooks/useMediaQuery';
import { useStudentShellNav } from '../hooks/useStudentShellNav';
import StudentHeader from './layout/StudentHeader';
import StudentIcon from './icons/StudentIcons';
import '../../styles/global.css';
import '../../admin/styles/admin.css';
import '../styles/sp-tokens.css';
import '../styles/student.css';
import '../styles/student-responsive.css';
import '../styles/student-theme.css';
import '../styles/student-design-system.css';
import '../styles/student-layout.css';
import '../styles/student-dashboard.css';
import '../styles/student-settings.css';

function StudentNavLinks({ onNavigate, collapsed }) {
  const location = useLocation();

  return studentNavItems.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) => {
        const active =
          isActive ||
          (Array.isArray(item.matchPaths) &&
            item.matchPaths.some((path) => location.pathname.startsWith(path)));
        return `student-nav__item${active ? ' student-nav__item--active' : ''}`;
      }}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      data-nav-label={item.label}
      aria-label={collapsed ? item.label : undefined}
    >
      <StudentIcon name={item.icon} size={20} className="student-nav__icon" />
      <span className="student-nav__label">{item.label}</span>
    </NavLink>
  ));
}

function StudentLayoutInner() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobileNav = useIsStudentMobileNav();
  const { isOverlayNav, navOpen, sidebarCollapsed, toggleNav, closeNav } = useStudentShellNav();
  const pageTitle = getStudentPageTitle(location.pathname);

  useEffect(() => {
    closeNav();
  }, [location.pathname, closeNav]);

  useEffect(() => {
    if (!navOpen || !isOverlayNav) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen, isOverlayNav]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape' && navOpen) closeNav();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navOpen, closeNav]);

  async function handleLogout() {
    try {
      await studentApi.logout();
      clearStudentAuth();
      broadcastRoleLogout('student');
      navigate('/login', { replace: true });
    } catch (err) {
      // Keep local session — httpOnly cookies may still be valid. Clearing UI-only
      // state would look logged-out while the server session remains.
      console.warn('[student] logout failed; session kept until retry succeeds', err?.message || err);
      window.alert('Sign out failed. Please check your connection and try again.');
    }
  }

  const shellClass = [
    'student-shell',
    'student-shell--v2',
    isOverlayNav ? 'student-shell--overlay-nav' : 'student-shell--persistent-nav',
    navOpen ? 'student-shell--nav-open' : '',
    sidebarCollapsed ? 'student-shell--sidebar-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClass}>
      {navOpen && isOverlayNav ? (
        <button
          type="button"
          className="student-sidebar-overlay"
          aria-label="Close navigation menu"
          onClick={closeNav}
        />
      ) : null}

      <aside id="student-sidebar-nav" className="student-sidebar sp-sidebar" aria-label="Student navigation">
        <div className="sp-sidebar__brand">
          <Link to="/dashboard" className="sp-sidebar__brand-link" aria-label="MRB Student Dashboard">
            <MrbEmblemImage
              className="sp-sidebar__brand-logo"
              width={44}
              height={44}
              alt="MRB Classes official logo"
            />
            <img
              src={MRB_LOGO_WORDMARK_SRC}
              alt="MRB Classes"
              className="sp-sidebar__brand-wordmark"
            />
          </Link>
        </div>
        <nav className="student-nav sp-sidebar__nav" aria-label="Main">
          <StudentNavLinks
            onNavigate={isOverlayNav ? closeNav : undefined}
            collapsed={sidebarCollapsed}
          />
        </nav>
        <div className="student-sidebar__footer sp-sidebar__footer">
          <button
            className="sp-sidebar__logout"
            type="button"
            onClick={handleLogout}
            title={sidebarCollapsed ? 'Sign out' : undefined}
            aria-label="Sign out"
          >
            <StudentIcon name="log-out" size={18} className="sp-sidebar__logout-icon" />
            <span className="sp-sidebar__logout-label">Sign out</span>
          </button>
        </div>
      </aside>

      <div className="student-main">
        <StudentHeader
          onToggleNav={toggleNav}
          navOpen={navOpen}
          sidebarCollapsed={sidebarCollapsed}
          isOverlayNav={isOverlayNav}
          pageTitle={pageTitle}
          onLogout={handleLogout}
        />

        <main className="student-content sp-portal-content sp-route-view">
          <Outlet
            context={{
              handleLogout,
              isMobileNav,
              mobileNavOpen: navOpen,
              toggleMobileNav: toggleNav,
            }}
          />
        </main>
      </div>

      {isOverlayNav ? (
        <nav className="student-bottom-nav sp-bottom-nav" aria-label="Student mobile navigation">
          {studentBottomNavItems.map((item) => {
            const isActive =
              item.to === '/dashboard/tests'
                ? location.pathname === '/dashboard/tests'
                : item.end
                  ? location.pathname === item.to
                  : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={`student-bottom-nav__item sp-bottom-nav__item${isActive ? ' student-bottom-nav__item--active sp-bottom-nav__item--active' : ''}`}
              >
                <span className="student-bottom-nav__indicator" aria-hidden="true" />
                <StudentIcon name={item.icon} size={22} className="sp-bottom-nav__icon" />
                <span className="student-bottom-nav__label">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}

export default function StudentLayout() {
  return (
    <StudentThemeProvider>
      <StudentLayoutInner />
    </StudentThemeProvider>
  );
}
