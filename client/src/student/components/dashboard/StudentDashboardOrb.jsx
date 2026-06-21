import { Link } from 'react-router-dom';
import StudentIcon from '../icons/StudentIcons';

export default function StudentDashboardOrb({
  to,
  icon,
  label,
  badge = 0,
  delay = 0,
  slotClass = '',
  onClick,
}) {
  const Tag = to ? Link : 'button';
  const linkProps = to ? { to } : { type: 'button', onClick };

  return (
    <Tag
      {...linkProps}
      className={`sp-dash-orb sp-animate-in sp-animate-in--${delay} ${slotClass}`.trim()}
      aria-label={label}
    >
      <span className="sp-dash-orb__circle">
        <StudentIcon
          name={icon}
          size={22}
          className={`sp-dash-orb__icon${badge > 0 && icon === 'bell' ? ' sp-icon--bell-alert' : ''}`}
        />
        {badge > 0 ? (
          <span className="sp-dash-orb__badge" aria-hidden>
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </span>
      <span className="sp-dash-orb__label">{label}</span>
    </Tag>
  );
}
