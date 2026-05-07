import './SocialMediaLinks.css';

const socialItems = [
  {
    name: 'Instagram',
    href: 'https://www.instagram.com/muzamil_rb',
    handle: '@muzamil_rb',
    className: 'social-links__icon--instagram',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm8.2 1.8H8A4.2 4.2 0 0 0 3.8 8v8a4.2 4.2 0 0 0 4.2 4.2h8a4.2 4.2 0 0 0 4.2-4.2V8A4.2 4.2 0 0 0 16 3.8Zm-4 3.2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Zm5.3-2.4a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z"
        />
      </svg>
    ),
  },
  {
    name: 'TikTok',
    href: 'https://www.tiktok.com/@mrb.classes.mdcat',
    handle: '@mrb.classes.mdcat',
    className: 'social-links__icon--tiktok',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M16.4 3c.4 2 1.7 3.3 3.6 3.7v2.7a6.8 6.8 0 0 1-3.5-1v6.2A6.6 6.6 0 1 1 9.9 8v3a3.8 3.8 0 1 0 2.8 3.6V3h3.7Z"
        />
      </svg>
    ),
  },
  {
    name: 'Facebook',
    href: 'https://www.facebook.com/MRB-CLASSES',
    handle: 'MRB-CLASSES',
    className: 'social-links__icon--facebook',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M13.2 22v-8h2.7l.5-3h-3.2V9.2c0-.9.3-1.6 1.6-1.6h1.7V5c-.3 0-1.4-.1-2.6-.1-2.6 0-4.4 1.6-4.4 4.6V11H7v3h2.5v8h3.7Z"
        />
      </svg>
    ),
  },
  {
    name: 'YouTube',
    href: 'https://www.youtube.com/@MuzamilRB',
    handle: 'Muzami lRB',
    className: 'social-links__icon--youtube',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M23.5 7.3a3 3 0 0 0-2.1-2.1C19.5 4.7 12 4.7 12 4.7s-7.5 0-9.4.5A3 3 0 0 0 .5 7.3 31.2 31.2 0 0 0 0 12a31.2 31.2 0 0 0 .5 4.7 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.2 31.2 0 0 0 24 12a31.2 31.2 0 0 0-.5-4.7ZM9.6 15.1V8.9l5.8 3.1-5.8 3.1Z"
        />
      </svg>
    ),
  },
];

export default function SocialMediaLinks({ compact = false }) {
  return (
    <div className={`social-links ${compact ? 'social-links--compact' : ''}`}>
      {socialItems.map((item) => (
        <a
          key={item.name}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="social-links__item"
          aria-label={`Open ${item.name} account`}
        >
          <span className={`social-links__icon ${item.className}`}>{item.icon}</span>
          <span className="social-links__text">
            <strong>{item.name}</strong>
            <small>{item.handle}</small>
          </span>
        </a>
      ))}
    </div>
  );
}
