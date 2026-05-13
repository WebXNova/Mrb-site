import { useState } from 'react';
import { Link } from 'react-router-dom';
import Badge from './Badge';
import Button from './Button';
import './CourseCard.css';

function levelBadgeTone(level) {
  const l = String(level || 'beginner').toLowerCase();
  if (l === 'advanced') return 'warning';
  if (l === 'intermediate') return 'neutral';
  return 'neutral';
}

export default function CourseCard({ course }) {
  const [imageFailed, setImageFailed] = useState(false);
  const { id, title, summary, thumbnail_url: thumbnailUrl, level } = course;

  const showCoverImage = Boolean(thumbnailUrl) && !imageFailed;
  const coursePath = `/courses/${encodeURIComponent(String(id))}`;

  return (
    <article className="course-card">
      <Link to={coursePath} className="course-card__link">
        <div className={`course-card__cover ${showCoverImage ? 'course-card__cover--with-image' : ''}`}>
          {showCoverImage ? (
            <img
              className="course-card__cover-image"
              src={thumbnailUrl}
              alt=""
              loading="eager"
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
          </div>

          <h3 className="course-card__title">{title}</h3>
          <p className="course-card__summary">{summary}</p>
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
