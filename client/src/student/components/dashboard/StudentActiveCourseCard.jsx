import { Link } from 'react-router-dom';
import { useInView } from '../../hooks/useInView';
import StudentIcon from '../icons/StudentIcons';
import StudentProgressBar from './StudentProgressBar';
import {
  admissionBadgeLabel,
  isAdmissionOpen,
} from '../../../course/courseAdmissionPresentation';

function getInitials(title) {
  return (title || 'C')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

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
  const [ref, inView] = useInView({ threshold: 0.2 });
  const course = data?.courses?.[0] || null;
  const progress = data?.progress ?? {};
  const progressPercent = Number.isFinite(Number(data?.progressPercent))
    ? Number(data.progressPercent)
    : progress.lecturesPercent ?? 0;

  const title = course?.title || course?.name || 'Your enrolled course';
  const subject = course?.subject || course?.subjectName || 'General';
  const admissionsOpen = isAdmissionOpen(course);
  const admissionStatus = course?.admission_status;
  const nextLecture = (data?.lectures || []).find((l) => !l.completed) || data?.lectures?.[0];
  const resumeHref = nextLecture?.id ? `/dashboard/lectures/${nextLecture.id}` : '/dashboard/lectures';

  return (
    <article ref={ref} className="sp-active-course sp-card sp-card--interactive sp-animate-in sp-animate-in--2">
      <div className="sp-active-course__thumb" aria-hidden>
        <span className="sp-active-course__thumb-inner">{getInitials(title)}</span>
      </div>

      <div className="sp-active-course__body">
        <div className="sp-active-course__header">
          <div>
            <p className="sp-label">Active course</p>
            <h2 className="sp-active-course__title">{title}</h2>
            <p className="sp-active-course__subject">{subject}</p>
            {admissionStatus ? (
              <span
                className={`sp-badge sp-badge--admission ${admissionsOpen ? 'sp-badge--soft-sage' : 'sp-badge--soft-navy'}`}
              >
                Admissions {admissionBadgeLabel(admissionStatus)}
              </span>
            ) : null}
          </div>
          <span className="sp-badge sp-badge--accent">{Math.round(progressPercent)}%</span>
        </div>

        {!admissionsOpen ? (
          <p className="sp-active-course__admission-warning" role="status">
            Admissions are closed for new students. Your enrollment remains active — you can continue learning.
          </p>
        ) : null}

        <div className="sp-active-course__progress">
          <StudentProgressBar percent={progressPercent} inView={inView} />
        </div>

        <dl className="sp-active-course__meta">
          <div>
            <dt>Lectures</dt>
            <dd>
              {data?.lecturesCompleted ?? 0}
              {progress.lecturesTotal ? ` / ${progress.lecturesTotal}` : ''}
            </dd>
          </div>
          <div>
            <dt>Tests</dt>
            <dd>{data?.tests?.length ?? 0} available</dd>
          </div>
          <div>
            <dt>Last activity</dt>
            <dd>{formatLastActivity(data)}</dd>
          </div>
        </dl>

        <div className="sp-active-course__actions">
          <Link to={resumeHref} className="sp-btn sp-btn--primary">
            <StudentIcon name="video" size={18} />
            Continue learning
          </Link>
          <Link to="/dashboard/my-courses" className="sp-btn sp-btn--secondary">
            View course
          </Link>
        </div>
      </div>
    </article>
  );
}
