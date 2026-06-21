import { Link } from 'react-router-dom';
import { getStoredUser } from '../../../auth/session';
import StudentProgressBar from './StudentProgressBar';
import StudentAnimatedStat from './StudentAnimatedStat';
import { useInView } from '../../hooks/useInView';

function getGreetingName(student) {
  const source = student?.fullName || student?.username || student?.email || 'Student';
  const first = source.trim().split(/\s+/)[0] || 'Student';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function getResumeHref(data) {
  const nextLecture = (data?.lectures || []).find((l) => !l.completed) || data?.lectures?.[0];
  if (nextLecture?.id) return `/dashboard/lectures/${nextLecture.id}`;
  return '/dashboard/lectures';
}

function resolveStreak(data) {
  const streak = data?.streak;
  if (streak && typeof streak.count === 'number') {
    return {
      count: streak.count,
      status: streak.status || 'active',
      message: streak.message || null,
    };
  }
  return { count: 0, status: 'inactive', message: null };
}

export default function StudentDashboardHero({ data }) {
  const student = getStoredUser('student_user') || {};
  const greetingName = getGreetingName(student);
  const [ref, inView] = useInView({ threshold: 0.2 });
  const progressPercent = data?.progressPercent ?? 0;
  const courseCount = data?.courses?.length ?? 0;
  const streak = resolveStreak(data);
  const resumeHref = getResumeHref(data);
  const streakStatusClass =
    streak.status !== 'active' && streak.status !== 'inactive'
      ? ` sp-hero-card__metric--streak-${streak.status}`
      : '';

  return (
    <section ref={ref} className="sp-hero-card sp-animate-in sp-animate-in--0" aria-labelledby="sp-hero-title">
      <div className="sp-hero-card__content">
        <p className="sp-label sp-hero-card__eyebrow">Your learning hub</p>
        <h1 id="sp-hero-title" className="sp-hero-card__title">
          Welcome back, <span className="sp-hero-card__name">{greetingName}</span>
        </h1>
        <p className="sp-hero-card__subtitle">Continue your learning journey — you&apos;re making real progress.</p>

        <div className="sp-hero-card__metrics">
          <div className="sp-hero-card__metric">
            <span className="sp-hero-card__metric-value">
              <StudentAnimatedStat value={progressPercent} enabled={inView} suffix="%" />
            </span>
            <span className="sp-hero-card__metric-label">Overall progress</span>
          </div>
          <div
            className={`sp-hero-card__metric${streakStatusClass}`}
            title={streak.message || undefined}
          >
            <span className="sp-hero-card__metric-value">
              <StudentAnimatedStat value={streak.count} enabled={inView} suffix=" days" />
            </span>
            <span className="sp-hero-card__metric-label">Active streak</span>
            {streak.message ? (
              <span className="sp-hero-card__streak-alert" role="status">
                {streak.message}
              </span>
            ) : null}
          </div>
          <div className="sp-hero-card__metric">
            <span className="sp-hero-card__metric-value">
              <StudentAnimatedStat value={courseCount} enabled={inView} />
            </span>
            <span className="sp-hero-card__metric-label">Total courses</span>
          </div>
        </div>

        <div className="sp-hero-card__progress">
          <div className="sp-hero-card__progress-meta">
            <span className="sp-label">Course completion</span>
            <span className="sp-hero-card__progress-pct">{Math.round(progressPercent)}%</span>
          </div>
          <StudentProgressBar percent={progressPercent} inView={inView} />
        </div>

        <Link to={resumeHref} className="sp-btn sp-btn--primary sp-hero-card__cta">
          Resume learning
        </Link>
      </div>
    </section>
  );
}
