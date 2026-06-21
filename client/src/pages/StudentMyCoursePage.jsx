import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatSalesDateLong } from '../course/courseSalesPage';
import { batchStatusLabel } from '../course/batchPresentation';
import StudentDashboardSkeleton from '../student/components/dashboard/StudentDashboardSkeleton';
import { useStudentMyCourse } from '../student/hooks/useStudentMyCourse';
import '../student/styles/student-dashboard.css';

function phaseLabel(phase) {
  if (phase === 'upcoming') return 'Starting soon';
  if (phase === 'in_progress') return 'In progress';
  if (phase === 'completed') return 'Completed';
  return 'Schedule pending';
}

function phaseTone(phase) {
  if (phase === 'upcoming') return 'student-my-course__phase--upcoming';
  if (phase === 'in_progress') return 'student-my-course__phase--active';
  if (phase === 'completed') return 'student-my-course__phase--done';
  return 'student-my-course__phase--muted';
}

function formatDateTime(value) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-PK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function StatCard({ label, value, hint, to }) {
  const body = (
    <>
      <p className="student-my-course__stat-label">{label}</p>
      <p className="student-my-course__stat-value">{value}</p>
      {hint ? <p className="student-my-course__stat-hint">{hint}</p> : null}
    </>
  );

  if (to) {
    return (
      <Link className="student-my-course__stat-card student-my-course__stat-card--link" to={to}>
        {body}
      </Link>
    );
  }

  return <article className="student-my-course__stat-card">{body}</article>;
}

export default function StudentMyCoursePage() {
  const { data, loading, error, authState } = useStudentMyCourse();

  const schedule = data?.schedule ?? {};
  const stats = data?.stats ?? {};
  const progress = data?.progress ?? {};
  const progressPercent = data?.progressPercent ?? 0;
  const course = data?.course;
  const batch = data?.batch;
  const enrollment = data?.enrollment;

  const daysRemainingLabel = useMemo(() => {
    if (schedule.daysRemaining == null) return '—';
    if (schedule.phase === 'completed') return '0 days';
    if (schedule.phase === 'upcoming' && schedule.startDate) {
      const start = new Date(schedule.startDate);
      const diff = Math.max(0, Math.ceil((start.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
      return `${diff} day${diff === 1 ? '' : 's'} until start`;
    }
    return `${schedule.daysRemaining} day${schedule.daysRemaining === 1 ? '' : 's'} left`;
  }, [schedule]);

  if (loading || authState === 'auth_required') {
    return <StudentDashboardSkeleton />;
  }

  if (authState === 'no_entitlement' || error || !course) {
    return (
      <section className="student-my-course">
        <article className="admin-card">
          <h2 className="heading-3">My Course</h2>
          <p className="student-lectures-page__status">
            {error || 'Course details are not available yet.'}
          </p>
          {authState === 'no_entitlement' ? (
            <div className="student-my-course__action-row" style={{ marginTop: '1rem' }}>
              <Link className="student-feature-card" to="/courses">
                <p className="student-feature-card__label">Enrollment</p>
                <p className="student-feature-card__title">Browse courses</p>
              </Link>
              <Link className="student-feature-card" to="/contact">
                <p className="student-feature-card__label">Support</p>
                <p className="student-feature-card__title">Contact us</p>
              </Link>
            </div>
          ) : null}
        </article>
      </section>
    );
  }

  return (
    <section className="student-my-course">
      <nav className="sp-settings__breadcrumb" aria-label="Breadcrumb">
        <Link to="/dashboard/my-courses" className="sp-settings__back">
          ← My Courses
        </Link>
      </nav>

      <header className="student-my-course__hero admin-card">
        <div className="student-my-course__hero-copy">
          <span className={`student-my-course__phase ${phaseTone(schedule.phase)}`}>
            {phaseLabel(schedule.phase)}
          </span>
          <h2 className="heading-2">{course.title}</h2>
          {course.short_description || course.description ? (
            <p className="student-my-course__lead">{course.short_description || course.description}</p>
          ) : null}
          <div className="student-my-course__meta-row">
            {schedule.batchTitle ? (
              <span>
                <strong>Cohort:</strong> {schedule.batchTitle}
              </span>
            ) : null}
            {batch?.status ? (
              <span>
                <strong>Status:</strong> {batchStatusLabel(batch.status)}
              </span>
            ) : null}
            {schedule.instructorName ? (
              <span>
                <strong>Instructor:</strong> {schedule.instructorName}
              </span>
            ) : null}
          </div>
        </div>
        {course.thumbnail_url ? (
          <div className="student-my-course__hero-media">
            <img src={course.thumbnail_url} alt="" loading="lazy" decoding="async" />
          </div>
        ) : null}
      </header>

      <article className="student-progress-card">
        <div className="student-my-course__progress-head">
          <h3 className="heading-3">Course progress</h3>
          <strong className="student-my-course__progress-pct">{progressPercent}%</strong>
        </div>
        <div className="student-progress-card__track">
          <div
            className="student-progress-card__fill"
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
          />
        </div>
        <p className="admin-stat-card__label" style={{ marginTop: '0.6rem' }}>
          Lectures {progress.lecturesPercent ?? 0}% • Tests {progress.testsPercent ?? 0}%
        </p>
        <p className="admin-stat-card__label">{daysRemainingLabel}</p>
      </article>

      <section className="student-my-course__stats">
        <StatCard
          label="Total lectures"
          value={stats.lecturesTotal ?? 0}
          hint={`${stats.lecturesCompleted ?? 0} completed`}
          to="/dashboard/lectures"
        />
        <StatCard
          label="Practice tests"
          value={stats.testsTotal ?? 0}
          hint={`${stats.testsCompleted ?? 0} completed`}
          to="/dashboard/tests"
        />
        <StatCard
          label="Questions asked"
          value={stats.questionsAsked ?? 0}
          hint="Doubts sent to teachers"
          to="/student/questions"
        />
        <StatCard
          label="Subjects"
          value={stats.subjectsTotal ?? 0}
          hint={`${stats.chaptersTotal ?? 0} chapters`}
        />
        <StatCard
          label="Test results"
          value={stats.resultsCount ?? 0}
          hint={
            stats.averageTestScore != null ? `Avg score ${stats.averageTestScore}%` : 'No scored attempts yet'
          }
          to="/dashboard/tests/history"
        />
        <StatCard
          label="Days remaining"
          value={schedule.daysRemaining ?? '—'}
          hint={
            schedule.totalDays != null
              ? `Day ${schedule.daysElapsed ?? 0} of ${schedule.totalDays}`
              : 'Schedule not set'
          }
        />
      </section>

      <div className="student-my-course__grid">
        <article className="admin-card">
          <h3 className="heading-4">Schedule</h3>
          <dl className="student-my-course__details">
            <div>
              <dt>Course starts</dt>
              <dd>{formatSalesDateLong(schedule.startDate)}</dd>
            </div>
            <div>
              <dt>Course ends</dt>
              <dd>{formatSalesDateLong(schedule.endDate)}</dd>
            </div>
            <div>
              <dt>Class timing</dt>
              <dd>{schedule.scheduleLabel || '—'}</dd>
            </div>
            <div>
              <dt>Timezone</dt>
              <dd>{schedule.timezone || 'UTC'}</dd>
            </div>
            <div>
              <dt>Enrollment opened</dt>
              <dd>{formatDateTime(schedule.enrollmentOpenAt)}</dd>
            </div>
            <div>
              <dt>Enrollment closed</dt>
              <dd>{formatDateTime(schedule.enrollmentCloseAt)}</dd>
            </div>
          </dl>
        </article>

        <article className="admin-card">
          <h3 className="heading-4">Your enrollment</h3>
          <dl className="student-my-course__details">
            <div>
              <dt>Enrolled on</dt>
              <dd>{formatDateTime(enrollment?.enrolledAt)}</dd>
            </div>
            <div>
              <dt>Enrollment status</dt>
              <dd>{enrollment?.status || '—'}</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>{enrollment?.accessStatus || data?.entitlement?.accessStatus || '—'}</dd>
            </div>
            <div>
              <dt>Approved on</dt>
              <dd>{formatDateTime(enrollment?.reviewedAt)}</dd>
            </div>
            <div>
              <dt>Recordings</dt>
              <dd>{data?.features?.recordingsEnabled ? 'Available' : 'Not available'}</dd>
            </div>
          </dl>
        </article>
      </div>

      <section className="student-my-course__actions admin-card">
        <h3 className="heading-4">Quick actions</h3>
        <div className="student-my-course__action-row">
          <Link className="student-feature-card" to="/dashboard/lectures">
            <p className="student-feature-card__label">Continue learning</p>
            <p className="student-feature-card__title">Open lectures</p>
          </Link>
          <Link className="student-feature-card" to="/dashboard/tests">
            <p className="student-feature-card__label">Practice</p>
            <p className="student-feature-card__title">Take a test</p>
          </Link>
          <Link className="student-feature-card" to="/student/questions?tab=ask">
            <p className="student-feature-card__label">Support</p>
            <p className="student-feature-card__title">Ask a doubt</p>
          </Link>
        </div>
      </section>
    </section>
  );
}
