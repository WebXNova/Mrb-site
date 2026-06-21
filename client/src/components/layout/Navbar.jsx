import { useState, useEffect } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { getStoredUser, onAuthChanged } from '../../auth/session';
import Button from '../ui/Button';
import MrbEmblemImage, { MRB_LOGO_WORDMARK_SRC } from '../brand/MrbEmblemImage';
import {
  GlobalSearchProvider,
  GlobalSearchDesktop,
  GlobalSearchMobileTrigger,
  GlobalSearchMobileOverlay,
} from './GlobalSearchBar';
import './Navbar.css';

const navLinks = [
  { to: '/', label: 'Home', end: true },
  { to: '/courses', label: 'Courses' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isStudentLoggedIn, setIsStudentLoggedIn] = useState(() => Boolean(getStoredUser('student_user')?.id));
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    function syncStudentAuthState() {
      setIsStudentLoggedIn(Boolean(getStoredUser('student_user')?.id));
    }
    syncStudentAuthState();
    return onAuthChanged(syncStudentAuthState);
  }, []);

  return (
    <GlobalSearchProvider>
      <header className={`navbar ${scrolled ? 'navbar--scrolled' : ''} ${menuOpen ? 'navbar--menu-open' : ''}`}>
        <div className="container navbar__inner">
          <Link to="/" className="navbar__brand" aria-label="MRB-LEARNING home">
            <MrbEmblemImage
              className="navbar__brand-logo"
              width={56}
              height={56}
              alt="MRB Classes - MDCAT Toppers Platform"
              loading="lazy"
            />
            <img
              src={MRB_LOGO_WORDMARK_SRC}
              alt="MRB Classes - MDCAT Toppers Platform"
              className="navbar__brand-wordmark"
              loading="lazy"
              decoding="async"
            />
          </Link>

          <div className="navbar__center">
            <GlobalSearchDesktop />
          </div>

          <div className="navbar__tools">
            <nav className="navbar__links" aria-label="Primary">
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `navbar__link ${isActive ? 'navbar__link--active' : ''}`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>

            <div className="navbar__actions">
              {isStudentLoggedIn ? (
                <Button as={NavLink} to="/dashboard" variant="primary" size="sm">
                  Student Portal
                </Button>
              ) : (
                <>
                  <Button as={NavLink} to="/login" variant="ghost" size="sm">
                    Sign In
                  </Button>
                  <Button as={NavLink} to="/register" variant="primary" size="sm">
                    Create Account
                  </Button>
                </>
              )}
            </div>

            <div className="navbar__mobile-controls">
              <GlobalSearchMobileTrigger />
              <button
                type="button"
                className="navbar__menu-toggle navbar__icon-btn"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span className={`navbar__menu-icon ${menuOpen ? 'navbar__menu-icon--open' : ''}`}>
                  <span />
                  <span />
                  <span />
                </span>
              </button>
            </div>
          </div>
        </div>

        <GlobalSearchMobileOverlay />

        <div className={`navbar__mobile ${menuOpen ? 'navbar__mobile--open' : ''}`}>
          <nav className="navbar__mobile-links" aria-label="Mobile">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `navbar__mobile-link ${isActive ? 'navbar__mobile-link--active' : ''}`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="navbar__mobile-actions">
            {isStudentLoggedIn ? (
              <Button as={NavLink} to="/dashboard" variant="primary" size="md" fullWidth>
                Student Portal
              </Button>
            ) : (
              <>
                <Button as={NavLink} to="/login" variant="secondary" size="md" fullWidth>
                  Sign In
                </Button>
                <Button as={NavLink} to="/register" variant="primary" size="md" fullWidth>
                  Create Account
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
    </GlobalSearchProvider>
  );
}
