import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useInView } from '../../hooks/useInView';
import StudentIcon from '../icons/StudentIcons';
import StudentProgressBar from './StudentProgressBar';
import {
  admissionBadgeLabel,
  isAdmissionOpen,
} from '../../../course/courseAdmissionPresentation';
import { getCourseTitleInitials, pickCourseThumbnailUrl } from '../../../course/courseThumbnail';

function formatLastActivity(data) {
  const activity = data?.recentActivity?.[0];
  if (activity?.createdAt) {
    return new Date(activity.createdAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }
  if (data?.lecturesCompleted > 0) return 'Recently';
  return 'Not started';
}

export default function StudentActiveCourseCard({ data }) {
  const reduceMotion = useReducedMotion();
  const [ref, inView] = useInView({ threshold: 0.2 });
  const [imageFailed, setImageFailed] = useState(false);
  const course = data?.courses?.[0] || data?.course || null;
  const progress = data?.progress ?? {};
  const progressPercent = Number.isFinite(Number(data?.progressPercent))
    ? Number(data.progressPercent)
    : progress.lecturesPercent ?? 0;

  const title = course?.title || course?.name || 'Your enrolled course';
  const description =
    course?.short_description || course?.description || course?.summary || '';
  const subject = course?.subject || course?.subjectName || null;
  const admissionsOpen = isAdmissionOpen(course);
  const admissionStatus = course?.admission_status;
  const nextLecture = (data?.lectures || []).find((l) => !l.completed) || data?.lectures?.[0];
  const resumeHref = nextLecture?.id ? `/dashboard/lectures/${nextLecture.id}` : '/dashboard/lectures';
  const thumbnailUrl = pickCourseThumbnailUrl(course);
  const showImage = Boolean(thumbnailUrl) && !imageFailed;
  const initials = getCourseTitleInitials(title);
  const lecturesTotal = progress.lecturesTotal ?? data?.lectures?.length ?? 0;
  const lecturesDone = data?.lecturesCompleted ?? 0;
  const testsCount = data?.tests?.length ?? 0;

  const subjectTags = [subject, course?.level].filter(Boolean);
  const featureTags = [
    lecturesTotal > 0 ? `${lecturesTotal} structured unit${lecturesTotal === 1 ? '' : 's'}` : null,
    testsCount > 0 ? `${testsCount} tests available` : null,
    `${Math.round(progressPercent)}% complete`,
  ].filter(Boolean);

  const enter = reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 };

  return (
    <motion.article
      ref={ref}
      className="sp-active-course"
      initial={enter}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="sp-active-course__visual">
        <div className="sp-active-course__media">
          {showImage ? (
            <img
              src={thumbnailUrl}
              alt={title}
              className="sp-active-course__image"
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="sp-active-course__fallback" aria-hidden="true">
              <span>{initials}</span>
            </div>
          )}
          <div className="sp-active-course__overlay" aria-hidden="true" />
          <span className="sp-active-course__badge">Your current course</span>
        </div>
      </div>

      <div className="sp-active-course__body">
        <h2 className="sp-active-course__title">{title}</h2>
        {description ? <p className="sp-active-course__lead">{description}</p> : null}

        {admissionStatus ? (
          <span
            className={`sp-badge sp-badge--admission ${admissionsOpen ? 'sp-badge--soft-sage' : 'sp-badge--soft-navy'}`}
          >
            Admissions {admissionBadgeLabel(admissionStatus)}
          </span>
        ) : null}

        {!admissionsOpen ? (
          <p className="sp-active-course__admission-warning" role="status">
            Admissions are closed for new students. Your enrollment remains active — you can continue
            learning.
          </p>
        ) : null}

        <dl className="sp-active-course__meta">
          <div>
            <dt>Lectures</dt>
            <dd>
              {lecturesDone}
              {lecturesTotal ? ` / ${lecturesTotal}` : ''}
            </dd>
          </div>
          <div>
            <dt>Tests</dt>
            <dd>{testsCount} available</dd>
          </div>
          <div>
            <dt>Last activity</dt>
            <dd>{formatLastActivity(data)}</dd>
          </div>
        </dl>

        <div className="sp-active-course__progress">
          <StudentProgressBar percent={progressPercent} inView={inView} />
        </div>

        {subjectTags.length > 0 ? (
          <ul className="sp-active-course__tags">
            {subjectTags.map((tag, index) => (
              <motion.li
                key={tag}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.05, duration: 0.3, ease: 'easeOut' }}
              >
                {tag}
              </motion.li>
            ))}
          </ul>
        ) : null}

        {featureTags.length > 0 ? (
          <ul className="sp-active-course__perks">
            {featureTags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        ) : null}

        <div className="sp-active-course__actions">
          <Link to={resumeHref} className="sp-btn sp-btn--primary sp-active-course__cta">
            <StudentIcon name="video" size={18} />
            Go to Course
          </Link>
          <Link to="/dashboard/my-courses" className="sp-btn sp-btn--secondary sp-active-course__view">
            View Course
          </Link>
        </div>
      </div>
    </motion.article>
  );
}
