import { Link } from 'react-router-dom';
import Logo from '../ui/Logo';
import './Footer.css';

const footerSections = [
  {
    title: 'Learn',
    links: [
      { to: '/courses', label: 'All Courses' },
      { to: '/courses?subject=physics', label: 'Physics' },
      { to: '/courses?subject=chemistry', label: 'Chemistry' },
      { to: '/courses?subject=biology', label: 'Biology' },
    ],
  },
  {
    title: 'Platform',
    links: [
      { to: '/about', label: 'About MRB' },
      { to: '/contact', label: 'Contact' },
      { to: '/login', label: 'Student Login' },
      { to: '/register', label: 'Get Started' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/privacy', label: 'Privacy Policy' },
      { to: '/terms', label: 'Terms of Service' },
      { to: '/refund', label: 'Refund Policy' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <Logo />
          <p className="footer__tagline">
            A focused learning platform for serious MRB students. Lectures, tests, and
            real teacher answers — in one calm dashboard.
          </p>
        </div>

        <div className="footer__links">
          {footerSections.map((section) => (
            <div key={section.title} className="footer__section">
              <h4 className="footer__section-title">{section.title}</h4>
              <ul className="footer__list">
                {section.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="footer__link">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="footer__bottom">
        <div className="container footer__bottom-inner">
          <span className="footer__copy">
            &copy; {new Date().getFullYear()} MRB Learning. All rights reserved.
          </span>
          <span className="footer__made">Made for the MRB classroom.</span>
        </div>
      </div>
    </footer>
  );
}
