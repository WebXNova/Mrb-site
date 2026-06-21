import { useEffect, useState } from 'react';
import { getCountdownParts } from '../../course/courseSalesPage';

function pad(n) {
  return String(n).padStart(2, '0');
}

export default function EnrollmentCountdown({
  deadlineIso,
  label = 'Enrollment closes in',
  expiredMessage = 'Time expired',
  variant = 'default',
}) {
  const [parts, setParts] = useState(() => getCountdownParts(deadlineIso));

  useEffect(() => {
    setParts(getCountdownParts(deadlineIso));
    if (!deadlineIso) return undefined;
    const id = window.setInterval(() => {
      setParts(getCountdownParts(deadlineIso));
    }, 1000);
    return () => window.clearInterval(id);
  }, [deadlineIso]);

  const rootClass = [
    'sales-countdown',
    variant === 'prominent' ? 'sales-countdown--prominent' : '',
    variant === 'compact' ? 'sales-countdown--compact' : '',
    variant === 'announcement' ? 'sales-countdown--announcement' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (!deadlineIso || !parts || parts.expired) {
    return (
      <div className={`${rootClass} sales-countdown--ended`} role="status">
        <span className="sales-countdown__label">{label}</span>
        <strong>{expiredMessage}</strong>
      </div>
    );
  }

  return (
    <div className={rootClass} role="timer" aria-live="polite">
      <span className="sales-countdown__label">{label}</span>
      <div className="sales-countdown__grid">
        <div className="sales-countdown__unit">
          <span className="sales-countdown__value">{pad(parts.days)}</span>
          <span className="sales-countdown__name">Days</span>
        </div>
        <div className="sales-countdown__unit">
          <span className="sales-countdown__value">{pad(parts.hours)}</span>
          <span className="sales-countdown__name">Hours</span>
        </div>
        <div className="sales-countdown__unit">
          <span className="sales-countdown__value">{pad(parts.minutes)}</span>
          <span className="sales-countdown__name">Min</span>
        </div>
        <div className="sales-countdown__unit">
          <span className="sales-countdown__value">{pad(parts.seconds)}</span>
          <span className="sales-countdown__name">Sec</span>
        </div>
      </div>
    </div>
  );
}
