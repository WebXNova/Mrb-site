import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { studentApi } from '../../api/studentApi';
import { clearStudentAuth, broadcastRoleLogout } from '../../auth/session';
import MrbEmblemImage, { MRB_LOGO_WORDMARK_SRC } from '../../components/brand/MrbEmblemImage';
import { StudentThemeProvider } from '../context/StudentThemeContext';
import { studentBottomNavItems, studentNavItems } from '../config/studentNavConfig';
import { useIsStudentMobileNav, useIsStudentOverlayNav } from '../hooks/useMediaQuery';
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

function StudentNavLinks({ onNavigate }) {
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
    >
      <StudentIcon name={item.icon} size={20} className="student-nav__icon" />
      {item.label}
    </NavLink>
  ));
}

function StudentLayoutInner() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobileNav = useIsStudentMobileNav();
  const isOverlayNav = useIsStudentOverlayNav();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

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
      if (event.key === 'Escape' && navOpen) setNavOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navOpen]);

  async function handleLogout() {
    try {
      await studentApi.logout();
    } catch {
      /* ignore */
    }
    clearStudentAuth();
    broadcastRoleLogout('student');
    navigate('/login', { replace: true });
  }

  function toggleNav() {
    setNavOpen((open) => !open);
  }

  function closeNav() {
    setNavOpen(false);
  }

  return (
    <div
      className={`student-shell student-shell--v2${navOpen ? ' student-shell--nav-open' : ''}${isOverlayNav ? ' student-shell--overlay-nav' : ' student-shell--persistent-nav'}`}
    >
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
          <StudentNavLinks onNavigate={isOverlayNav ? closeNav : undefined} />
        </nav>
        <div className="student-sidebar__footer sp-sidebar__footer">
          <button className="sp-btn sp-btn--secondary sp-btn--full" type="button" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="student-main">
        <StudentHeader
          onToggleNav={toggleNav}
          navOpen={navOpen}
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
            const isActive = item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={`student-bottom-nav__item sp-bottom-nav__item${isActive ? ' student-bottom-nav__item--active sp-bottom-nav__item--active' : ''}`}
              >
                <StudentIcon name={item.icon} size={20} className="sp-bottom-nav__icon" />
                {item.label}
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
