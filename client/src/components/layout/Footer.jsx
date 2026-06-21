import { Link } from 'react-router-dom';
import Logo from '../ui/Logo';
import SocialMediaLinks from '../ui/SocialMediaLinks';
import './Footer.css';

const footerSections = [
  {
    title: 'Learn',
    links: [
      { to: '/courses', label: 'All Courses' },
      { to: '/courses?tab=mdcat', label: 'MDCAT Courses' },
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
            manual admin-reviewed answers — in one calm dashboard.
          </p>
          <div className="footer__social">
            <h4 className="footer__section-title">Follow MRB</h4>
            <SocialMediaLinks />
          </div>
        </div>

        <div className="footer__links">
          {footerSections.map((section) => (
            <div key={section.title} className="footer__section">
              <h4 className="footer__section-title">{section.title}</h4>
              <ul className={`footer__list${section.title === 'Legal' ? ' footer__list--legal' : ''}`}>
                {section.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="footer__link">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
              {section.title === 'Legal' && (
                <p className="footer__credit">
                  Built by{' '}
                  <a
                    href="https://www.webxnova.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="footer__credit-link"
                  >
                    WebX Nova
                  </a>
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="footer__bottom">
        <div className="container footer__bottom-inner">
          <span className="footer__copy">
            &copy; {new Date().getFullYear()} MRB Classes. All rights reserved.
          </span>
          <a
            href="https://webxnova.com"
            target="_blank"
            rel="noopener noreferrer"
            className="footer__made footer__made-link"
          >
            Build By WebX Nova
          </a>
        </div>
      </div>
    </footer>
  );
}
