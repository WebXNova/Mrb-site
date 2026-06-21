import { Link } from 'react-router-dom';
import StudentIcon from '../student/components/icons/StudentIcons';
import '../student/styles/student-settings.css';

const settingsLinks = [
  {
    to: '/dashboard/my-courses',
    icon: 'book-open',
    title: 'My Courses',
    description: 'See every course you have purchased and your enrollment status.',
  },
  {
    to: '/dashboard/settings/profile',
    icon: 'user',
    title: 'Profile',
    description: 'View your account details and active sessions.',
  },
];

export default function StudentSettingsPage() {
  return (
    <section className="sp-settings">
      <header className="sp-settings__header sp-animate-in sp-animate-in--0">
        <p className="sp-label">Account</p>
        <h1 className="sp-settings__title">Settings</h1>
        <p className="sp-settings__subtitle">Manage your courses, profile, and account preferences.</p>
      </header>

      <div className="sp-settings__grid">
        {settingsLinks.map((item, index) => (
          <Link
            key={item.to}
            to={item.to}
            className={`sp-settings-card sp-card sp-card--interactive sp-animate-in sp-animate-in--${index + 1}`}
          >
            <span className="sp-settings-card__icon" aria-hidden>
              <StudentIcon name={item.icon} size={24} className="sp-icon--burgundy" />
            </span>
            <div className="sp-settings-card__copy">
              <h2 className="sp-settings-card__title">{item.title}</h2>
              <p className="sp-settings-card__desc">{item.description}</p>
            </div>
            <span className="sp-settings-card__arrow" aria-hidden>
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
