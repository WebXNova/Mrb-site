import { useState } from 'react';
import { Link } from 'react-router-dom';
import CourseEnrollmentCtaButton from '../course/CourseEnrollmentCtaButton';
import {
  admissionBadgeLabel,
  admissionBadgeTone,
  isAdmissionOpen,
} from '../../course/courseAdmissionPresentation';
import { buildPricingDisplay } from '../../course/coursePresentation';
import './PopularCourseCard.css';

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 8v4.5l2.5 1.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function formatSchedulePoint(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const time = d
    .toLocaleString('en-PK', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\s/g, ' ')
    .toUpperCase();
  return { date, time };
}

function inferSubject(course) {
  const text = `${course.title} ${course.summary}`.toLowerCase();
  if (text.includes('physics')) return 'Physics';
  if (text.includes('chemistry')) return 'Chemistry';
  if (text.includes('biology')) return 'Biology';
  if (text.includes('english')) return 'English';
  return null;
}

export default function PopularCourseCard({
  course,
  badge,
  badgeTone = 'red',
  buttonStyle = 'primary',
  ctaLabelOverride,
  showSubject = true,
  style,
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const {
    id,
    title,
    summary,
    thumbnail_url: thumbnailUrl,
    level,
    pricing,
    admission_status: admissionStatus,
    enrollment_message: enrollmentMessage,
    is_enrollment_open: isEnrollmentOpen,
    start_date: startDate,
    end_date: endDate,
  } = course;

  const pricingDisplay = buildPricingDisplay(pricing);
  const admissionsOpen = isAdmissionOpen(course);
  const subject = inferSubject(course);
  const start = formatSchedulePoint(startDate);
  const end = formatSchedulePoint(endDate);
  const showCoverImage = Boolean(thumbnailUrl) && !imageFailed;
  const coursePath = `/courses/${encodeURIComponent(String(id))}`;
  const courseAdmission = {
    admission_status: admissionStatus,
    is_enrollment_open: isEnrollmentOpen,
    enrollment_message: enrollmentMessage,
    start_date: startDate,
    end_date: endDate,
  };

  const buttonClass = [
    'pc-card__cta',
    buttonStyle === 'primary' && 'pc-card__cta--primary',
    buttonStyle === 'outline' && 'pc-card__cta--outline',
    buttonStyle === 'free' && 'pc-card__cta--free',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      className={`pc-card pc-card--${badgeTone}`}
      style={style}
    >
      <span className="pc-card__accent" aria-hidden="true" />

      <Link to={coursePath} className="pc-card__link">
        <div className={`pc-card__cover ${showCoverImage ? 'pc-card__cover--image' : ''}`}>
          {showCoverImage ? (
            <img
              src={thumbnailUrl}
              alt={`${title} course thumbnail`}
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="pc-card__cover-fallback" aria-hidden="true">
              {title.slice(0, 1)}
            </div>
          )}
          <div className="pc-card__cover-shade" aria-hidden="true" />
        </div>

        <div className="pc-card__body">
          <div className="pc-card__badges">
            {badge ? (
              <span className={`pc-card__badge pc-card__badge--${badgeTone}`}>{badge}</span>
            ) : null}
            <span className={`pc-card__status pc-card__status--${admissionBadgeTone(admissionStatus)}`}>
              {admissionBadgeLabel(admissionStatus)}
            </span>
            {level ? (
              <span className="pc-card__level">{level}</span>
            ) : null}
            {pricingDisplay?.isFree ? (
              <span className="pc-card__price pc-card__price--free">Free</span>
            ) : pricingDisplay ? (
              <span className="pc-card__price">
                {pricingDisplay.currency} {pricingDisplay.amount.toLocaleString('en-PK')}
              </span>
            ) : null}
          </div>

          <h3 className="pc-card__title">{title}</h3>

          {showSubject && subject ? (
            <span className="pc-card__subject">{subject}</span>
          ) : null}

          {(start || end) && (
            <div className="pc-card__schedule">
              {start ? (
                <div className="pc-card__schedule-row">
                  <CalendarIcon />
                  <span>
                    <strong>Starts:</strong> {start.date}, {start.time}
                  </span>
                </div>
              ) : null}
              {end ? (
                <div className="pc-card__schedule-row">
                  <ClockIcon />
                  <span>
                    <strong>Ends:</strong> {end.date}, {end.time}
                  </span>
                </div>
              ) : null}
            </div>
          )}

          {summary ? <p className="pc-card__summary">{summary}</p> : null}

          {!admissionsOpen && enrollmentMessage ? (
            <p className="pc-card__note" role="status">
              {enrollmentMessage}
            </p>
          ) : null}
        </div>
      </Link>

      <div className="pc-card__actions">
        <CourseEnrollmentCtaButton
          courseId={id}
          labelContext="card"
          size="lg"
          fullWidth
          className={buttonClass}
          labelOverride={ctaLabelOverride}
          courseAdmission={courseAdmission}
        />
      </div>
    </article>
  );
}
