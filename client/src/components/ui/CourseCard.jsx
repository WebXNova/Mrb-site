import { useState } from 'react';
import { Link } from 'react-router-dom';
import Badge from './Badge';
import CourseEnrollmentCtaButton from '../course/CourseEnrollmentCtaButton';
import { buildPricingDisplay } from '../../course/coursePresentation';
import { formatSalesDate } from '../../course/courseSalesPage';
import {
  admissionBadgeLabel,
  admissionBadgeTone,
  isAdmissionOpen,
} from '../../course/courseAdmissionPresentation';
import './CourseCard.css';

function levelBadgeTone(level) {
  const l = String(level || 'beginner').toLowerCase();
  if (l === 'advanced') return 'warning';
  if (l === 'intermediate') return 'neutral';
  return 'neutral';
}

function formatAmount(amount, currency) {
  return `${currency || 'PKR'} ${Number(amount || 0).toLocaleString('en-PK')}`;
}

function CoursePricingTag({ display }) {
  if (!display) return null;
  if (display.isFree) {
    return (
      <div className="course-card__price">
        <span className="course-card__price-current">Free</span>
      </div>
    );
  }
  return (
    <div className="course-card__price">
      <span className="course-card__price-current">{formatAmount(display.amount, display.currency)}</span>
      {display.original ? (
        <span className="course-card__price-original">{formatAmount(display.original, display.currency)}</span>
      ) : null}
    </div>
  );
}

export default function CourseCard({ course }) {
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

  const showCoverImage = Boolean(thumbnailUrl) && !imageFailed;
  const coursePath = `/courses/${encodeURIComponent(String(id))}`;
  const courseAdmission = {
    admission_status: admissionStatus,
    is_enrollment_open: isEnrollmentOpen,
    enrollment_message: enrollmentMessage,
    start_date: startDate,
    end_date: endDate,
  };

  return (
    <article className="course-card">
      <Link to={coursePath} className="course-card__link">
        <div className={`course-card__cover ${showCoverImage ? 'course-card__cover--with-image' : ''}`}>
          {showCoverImage ? (
            <img
              className="course-card__cover-image"
              src={thumbnailUrl}
              alt={`${title} course thumbnail`}
              loading="lazy"
              decoding="async"
              sizes="(max-width: 768px) 100vw, 33vw"
              onError={() => setImageFailed(true)}
            />
          ) : null}
          <div className="course-card__cover-bg" aria-hidden="true" />
          {!showCoverImage ? (
            <span className="course-card__subject" aria-hidden>
              {title.slice(0, 1)}
            </span>
          ) : null}
          {!showCoverImage ? <div className="course-card__cover-title">{title}</div> : null}
        </div>

        <div className="course-card__body">
          <div className="course-card__meta">
            <Badge tone={levelBadgeTone(level)} size="md">
              <span className="badge--dot" />
              {level}
            </Badge>
            <Badge tone={admissionBadgeTone(admissionStatus)} size="md">
              {admissionBadgeLabel(admissionStatus)}
            </Badge>
            <CoursePricingTag display={pricingDisplay} />
          </div>

          <h3 className="course-card__title">{title}</h3>
          {startDate || endDate ? (
            <p className="course-card__dates">
              Course: {formatSalesDate(startDate) || '—'} – {formatSalesDate(endDate) || '—'}
            </p>
          ) : null}
          <p className="course-card__summary">{summary}</p>
          {!admissionsOpen && enrollmentMessage ? (
            <p className="course-card__admission-note" role="status">
              {enrollmentMessage}
            </p>
          ) : null}
        </div>
      </Link>
      <div className="course-card__actions">
        <CourseEnrollmentCtaButton
          courseId={id}
          labelContext="card"
          size="lg"
          courseAdmission={courseAdmission}
        />
      </div>
    </article>
  );
}
