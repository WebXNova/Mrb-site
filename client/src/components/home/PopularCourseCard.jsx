import { useState } from 'react';
import { Link } from 'react-router-dom';
import CourseEnrollmentCtaButton from '../course/CourseEnrollmentCtaButton';
import {
  admissionBadgeLabel,
  admissionBadgeTone,
  isAdmissionOpen,
} from '../../course/courseAdmissionPresentation';
import { buildPricingDisplay } from '../../course/coursePresentation';
import {
  formatCourseDuration,
  formatCourseTypeLabel,
  isCatalogCourseFree,
} from '../../course/courseDiscovery';
import { ENROLLMENT_BUTTON_STATE } from '../../course/courseEnrollmentCta';
import { getCourseTitleInitials, pickCourseThumbnailUrl } from '../../course/courseThumbnail';
import { useEnrollmentState } from '../../hooks/useEnrollmentState';
import './PopularCourseCard.css';

function formatScheduleDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
}

function inferSubject(course) {
  const text = `${course.title || ''} ${course.summary || ''}`.toLowerCase();
  if (text.includes('physics')) return 'Physics';
  if (text.includes('chemistry')) return 'Chemistry';
  if (text.includes('biology')) return 'Biology';
  if (text.includes('english')) return 'English';
  return null;
}

export default function PopularCourseCard({ course, isCurrent = false, style }) {
  const [imageFailed, setImageFailed] = useState(false);
  const { state: enrollmentState } = useEnrollmentState(course.id);
  const {
    id,
    title,
    summary,
    thumbnail_url: mappedThumbnail,
    level,
    pricing,
    admission_status: admissionStatus,
    enrollment_message: enrollmentMessage,
    is_enrollment_open: isEnrollmentOpen,
    start_date: startDate,
    end_date: endDate,
  } = course;

  const pricingDisplay = buildPricingDisplay(pricing);
  const isFree = isCatalogCourseFree(course);
  const admissionsOpen = isAdmissionOpen(course);
  const subject = inferSubject(course);
  const duration = formatCourseDuration(startDate, endDate);
  const startLabel = formatScheduleDate(startDate);
  const endLabel = formatScheduleDate(endDate);
  const thumbnailUrl = pickCourseThumbnailUrl(course) || mappedThumbnail;
  const showCoverImage = Boolean(thumbnailUrl) && !imageFailed;
  const coursePath = `/courses/${encodeURIComponent(String(id))}`;
  const courseAdmission = {
    admission_status: admissionStatus,
    is_enrollment_open: isEnrollmentOpen,
    enrollment_message: enrollmentMessage,
    start_date: startDate,
    end_date: endDate,
  };

  const current =
    isCurrent || enrollmentState?.buttonState === ENROLLMENT_BUTTON_STATE.CONTINUE_LEARNING;
  const typeLabel = formatCourseTypeLabel(course);

  return (
    <article
      className={`pc-card${current ? ' pc-card--current' : ''}${isFree ? ' pc-card--free' : ''}`}
      style={style}
    >
      <Link to={coursePath} className="pc-card__link">
        <div className={`pc-card__cover${showCoverImage ? ' pc-card__cover--image' : ''}`}>
          {showCoverImage ? (
            <img
              src={thumbnailUrl}
              alt={`${title} course thumbnail`}
              width={640}
              height={360}
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="pc-card__cover-fallback" aria-hidden="true">
              {getCourseTitleInitials(title)}
            </div>
          )}
        </div>

        <div className="pc-card__body">
          <div className="pc-card__badges">
            {current ? <span className="pc-card__badge pc-card__badge--current">Current course</span> : null}
            <span className={`pc-card__badge pc-card__badge--type${isFree ? ' pc-card__badge--free' : ''}`}>
              {typeLabel}
            </span>
            <span className={`pc-card__status pc-card__status--${admissionBadgeTone(admissionStatus)}`}>
              {admissionBadgeLabel(admissionStatus)}
            </span>
          </div>

          <h3 className="pc-card__title">{title}</h3>

          {subject ? <span className="pc-card__subject">{subject}</span> : null}

          {summary ? <p className="pc-card__summary">{summary}</p> : <p className="pc-card__summary pc-card__summary--empty">&nbsp;</p>}

          <ul className="pc-card__meta">
            {pricingDisplay && !pricingDisplay.isFree ? (
              <li>
                <span>Price</span>
                <strong>
                  {pricingDisplay.currency} {pricingDisplay.amount.toLocaleString('en-PK')}
                </strong>
              </li>
            ) : (
              <li>
                <span>Price</span>
                <strong>Free</strong>
              </li>
            )}
            {duration ? (
              <li>
                <span>Duration</span>
                <strong>{duration}</strong>
              </li>
            ) : startLabel || endLabel ? (
              <li>
                <span>Dates</span>
                <strong>
                  {startLabel || '—'} – {endLabel || '—'}
                </strong>
              </li>
            ) : null}
            {level ? (
              <li>
                <span>Level</span>
                <strong>{level}</strong>
              </li>
            ) : null}
          </ul>

          {!admissionsOpen && enrollmentMessage ? (
            <p className="pc-card__note" role="status">
              {enrollmentMessage}
            </p>
          ) : null}
        </div>
      </Link>

      <div className="pc-card__actions">
        <Link to={coursePath} className="pc-card__view">
          View Course
        </Link>
        <CourseEnrollmentCtaButton
          courseId={id}
          course={course}
          courseTitle={title}
          isFreeCourse={isFree}
          labelContext="card"
          size="lg"
          fullWidth
          className="pc-card__cta"
          courseAdmission={courseAdmission}
        />
      </div>
    </article>
  );
}
