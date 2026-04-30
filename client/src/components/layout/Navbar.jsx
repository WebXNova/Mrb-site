import { useState, useEffect } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { getStudentToken, onAuthChanged } from '../../auth/session';
import Button from '../ui/Button';
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
  const [studentToken, setStudentToken] = useState(() => getStudentToken());
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
    return onAuthChanged(() => {
      setStudentToken(getStudentToken());
    });
  }, []);

  return (
    <header className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`}>
      <div className="container navbar__inner">
        <Link to="/" className="navbar__brand" aria-label="MRB-LEARNING home">
          <img
            src="/brand/mrb-logo-icon.png"
            alt="MRB Classes official logo"
            className="navbar__brand-logo"
          />
          <img
            src="/brand/mrb-logo-wordmark-official.png"
            alt="MRB Classes"
            className="navbar__brand-wordmark"
          />
        </Link>

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
          {studentToken ? (
            <Button as={NavLink} to="/student" variant="primary" size="sm">
              Student Portal
            </Button>
          ) : (
            <>
              <Button as={NavLink} to="/login" variant="ghost" size="sm">
                Sign In
              </Button>
              <Button as={NavLink} to="/register" variant="primary" size="sm">
                Get started
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          className="navbar__menu-toggle"
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
          {studentToken ? (
            <Button as={NavLink} to="/student" variant="primary" size="md" fullWidth>
              Student Portal
            </Button>
          ) : (
            <>
              <Button as={NavLink} to="/login" variant="secondary" size="md" fullWidth>
                Sign In
              </Button>
              <Button as={NavLink} to="/register" variant="primary" size="md" fullWidth>
                Get started
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
