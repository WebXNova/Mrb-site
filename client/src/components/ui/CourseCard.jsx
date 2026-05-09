import { useState } from 'react';
import { Link } from 'react-router-dom';
import Badge from './Badge';
import Button from './Button';
import './CourseCard.css';

function formatPrice(price) {
  if (price === 0) return 'Free';
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(price);
  return `Rs ${formatted}`;
}

export default function CourseCard({ course }) {
  const [imageFailed, setImageFailed] = useState(false);
  const {
    id,
    title,
    subject,
    summary,
    summaryBullets,
    instructor,
    lecturesCount,
    testsCount,
    durationWeeks,
    rating,
    studentsEnrolled,
    price,
    originalPrice,
    accentColor,
    coverImage,
  } = course;

  const discount =
    originalPrice && originalPrice > price
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : 0;

  const showCoverImage = Boolean(coverImage) && !imageFailed;

  return (
    <article className="course-card">
      <Link to={`/courses/${id}`} className="course-card__link">
        <div
          className={`course-card__cover ${showCoverImage ? 'course-card__cover--with-image' : ''}`}
          style={{ '--cover-accent': accentColor || 'var(--color-primary)' }}
        >
          {showCoverImage ? (
            <img
              className="course-card__cover-image"
              src={coverImage}
              alt={`${title} cover`}
              loading="eager"
              decoding="async"
              sizes="(max-width: 768px) 100vw, 33vw"
              onError={() => setImageFailed(true)}
            />
          ) : null}
          <div className="course-card__cover-bg" aria-hidden="true" />
          {!showCoverImage ? <span className="course-card__subject">{subject}</span> : null}
          {!showCoverImage && discount > 0 ? (
            <span className="course-card__discount">-{discount}%</span>
          ) : null}
          {!showCoverImage ? <div className="course-card__cover-title">{title}</div> : null}
        </div>

        <div className="course-card__body">
          <div className="course-card__meta">
            <Badge tone={subject.toLowerCase()} size="md">
              <span className="badge--dot" />
              {subject}
            </Badge>
            <span className="course-card__rating" aria-label={`Rating ${rating}`}>
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.2 1 5.9L10 14.9 4.8 17.8l1-5.9L1.5 7.7l5.9-.9L10 1.5z" />
              </svg>
              {rating.toFixed(1)}
            </span>
          </div>

          <h3 className="course-card__title">{title}</h3>
          {Array.isArray(summaryBullets) && summaryBullets.length > 0 ? (
            <ul className="course-card__summary-bullets">
              {summaryBullets.map((line) => (
                <li key={line} className="course-card__summary-bullet">
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="course-card__summary">{summary}</p>
          )}

          <div className="course-card__stats">
            <span className="course-card__stat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 8a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4z" />
                <polygon points="10,9 16,12 10,15" fill="currentColor" stroke="none" />
              </svg>
              {lecturesCount} lectures
            </span>
            <span className="course-card__stat-divider" />
            <span className="course-card__stat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
              {testsCount} tests
            </span>
            <span className="course-card__stat-divider" />
            <span className="course-card__stat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
              {durationWeeks} wks
            </span>
          </div>

          <div className="course-card__footer">
            <div className="course-card__instructor">
              <div className="course-card__instructor-avatar" aria-hidden="true">
                {instructor.charAt(0)}
              </div>
              <div className="course-card__instructor-info">
                <span className="course-card__instructor-label">Instructor</span>
                <span className="course-card__instructor-name">{instructor}</span>
              </div>
            </div>

            <div className="course-card__price">
              <span className="course-card__price-current">{formatPrice(price)}</span>
              {originalPrice && originalPrice > price ? (
                <span className="course-card__price-original">
                  {formatPrice(originalPrice)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </Link>
      <div className="course-card__actions">
        <Button as={Link} to="/enroll" variant="accent" size="lg">
          Enroll now
        </Button>
      </div>
    </article>
  );
}
