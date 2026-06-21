import { Link } from 'react-router-dom';
import {
  admissionBadgeLabel,
  isAdmissionOpen,
} from '../course/courseAdmissionPresentation';
import { formatSalesDateLong } from '../course/courseSalesPage';
import StudentIcon from '../student/components/icons/StudentIcons';
import { useStudentMyCourses } from '../student/hooks/useStudentMyCourses';
import '../student/styles/student-settings.css';

function formatDateTime(value) {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

function titleCase(value) {
  const text = String(value || '').trim();
  if (!text) return '—';
  return text.charAt(0).toUpperCase() + text.slice(1).replace(/_/g, ' ');
}

function getCourseInitials(title) {
  return (title || 'C')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}

function accessTone(accessStatus) {
  const status = String(accessStatus || '').toLowerCase();
  if (status === 'active') return 'sp-badge--soft-sage';
  if (status === 'revoked') return 'sp-badge--soft-gold';
  return 'sp-badge--soft-navy';
}

function paymentTone(orderStatus) {
  const status = String(orderStatus || '').toLowerCase();
  if (status === 'paid') return 'sp-badge--soft-sage';
  if (status === 'pending' || status === 'created') return 'sp-badge--soft-gold';
  return 'sp-badge--soft-navy';
}

function SummaryStat({ label, value, hint }) {
  return (
    <article className="sp-my-courses-stat sp-card">
      <p className="sp-my-courses-stat__label">{label}</p>
      <p className="sp-my-courses-stat__value">{value}</p>
      {hint ? <p className="sp-my-courses-stat__hint">{hint}</p> : null}
    </article>
  );
}

function CourseEnrollmentCard({ enrollment, delay }) {
  const title = enrollment.courseTitle || 'Untitled course';
  const hasActiveAccess = String(enrollment.accessStatus || '').toLowerCase() === 'active';
  const admissionsOpen = isAdmissionOpen(enrollment);

  return (
    <article className={`sp-my-courses-card sp-card sp-card--interactive sp-animate-in sp-animate-in--${delay}`}>
      <div className="sp-my-courses-card__thumb" aria-hidden>
        <span>{getCourseInitials(title)}</span>
      </div>

      <div className="sp-my-courses-card__body">
        <div className="sp-my-courses-card__head">
          <div>
            <p className="sp-label">Course</p>
            <h2 className="sp-my-courses-card__title">{title}</h2>
          </div>
          <span className={`sp-badge ${accessTone(enrollment.accessStatus)}`}>
            {titleCase(enrollment.accessStatus)} access
          </span>
        </div>

        <div className="sp-my-courses-card__badges">
          <span className={`sp-badge sp-badge--burgundy`}>{titleCase(enrollment.status)}</span>
          {enrollment.orderStatus ? (
            <span className={`sp-badge ${paymentTone(enrollment.orderStatus)}`}>
              Payment {titleCase(enrollment.orderStatus)}
            </span>
          ) : null}
          {enrollment.admission_status ? (
            <span className={`sp-badge ${admissionsOpen ? 'sp-badge--soft-sage' : 'sp-badge--soft-gold'}`}>
              Admissions {admissionBadgeLabel(enrollment.admission_status)}
            </span>
          ) : null}
        </div>

        <dl className="sp-my-courses-card__meta">
          <div>
            <dt>Enrolled on</dt>
            <dd>{formatDateTime(enrollment.createdAt)}</dd>
          </div>
          <div>
            <dt>Payment date</dt>
            <dd>{formatDateTime(enrollment.orderPaidAt)}</dd>
          </div>
          <div>
            <dt>Course starts</dt>
            <dd>{formatSalesDateLong(enrollment.start_date)}</dd>
          </div>
          <div>
            <dt>Course ends</dt>
            <dd>{formatSalesDateLong(enrollment.end_date)}</dd>
          </div>
          <div>
            <dt>Enrollment source</dt>
            <dd>{titleCase(enrollment.enrollmentSource)}</dd>
          </div>
          <div>
            <dt>Order ID</dt>
            <dd>{enrollment.orderId ? `#${enrollment.orderId}` : '—'}</dd>
          </div>
        </dl>

        <div className="sp-my-courses-card__actions">
          {hasActiveAccess ? (
            <Link to="/dashboard/my-course" className="sp-btn sp-btn--primary sp-btn--sm">
              <StudentIcon name="book-open" size={16} />
              View course details
            </Link>
          ) : null}
          <Link to="/dashboard/lectures" className="sp-btn sp-btn--secondary sp-btn--sm">
            Open lectures
          </Link>
          {!hasActiveAccess && enrollment.orderStatus !== 'paid' ? (
            <Link to="/courses" className="sp-btn sp-btn--ghost sp-btn--sm">
              Complete enrollment
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function StudentMyCoursesPage() {
  const { enrollments, loading, error, authState } = useStudentMyCourses();

  const totalPurchased = enrollments.length;
  const activeAccessCount = enrollments.filter(
    (row) => String(row.accessStatus || '').toLowerCase() === 'active'
  ).length;
  const paidCount = enrollments.filter(
    (row) => String(row.orderStatus || '').toLowerCase() === 'paid'
  ).length;

  if (loading || authState === 'auth_required') {
    return (
      <section className="sp-settings sp-my-courses">
        <p className="sp-body sp-text-center">Loading your courses…</p>
      </section>
    );
  }

  if (authState === 'error') {
    return (
      <section className="sp-settings sp-my-courses">
        <article className="sp-panel sp-panel--warning">
          <h2 className="sp-panel__title">Unable to load courses</h2>
          <p className="sp-body sp-body--error">{error}</p>
          <Link to="/dashboard/settings" className="sp-btn sp-btn--secondary">
            Back to settings
          </Link>
        </article>
      </section>
    );
  }

  return (
    <section className="sp-settings sp-my-courses">
      <nav className="sp-settings__breadcrumb" aria-label="Breadcrumb">
        <Link to="/dashboard/settings" className="sp-settings__back">
          ← Settings
        </Link>
      </nav>

      <header className="sp-my-courses-hero sp-card sp-animate-in sp-animate-in--0">
        <div className="sp-my-courses-hero__copy">
          <p className="sp-label">Your library</p>
          <h1 className="sp-my-courses-hero__title">My Courses</h1>
          <p className="sp-my-courses-hero__lead">
            You have purchased{' '}
            <strong>{totalPurchased}</strong> course{totalPurchased === 1 ? '' : 's'} all time.
            {activeAccessCount > 0
              ? ` ${activeAccessCount} ${activeAccessCount === 1 ? 'has' : 'have'} active access right now.`
              : ''}
          </p>
        </div>
        <div className="sp-my-courses-hero__badge" aria-label={`${totalPurchased} courses purchased`}>
          <span className="sp-my-courses-hero__badge-value">{totalPurchased}</span>
          <span className="sp-my-courses-hero__badge-label">
            Course{totalPurchased === 1 ? '' : 's'} bought
          </span>
        </div>
      </header>

      <section className="sp-my-courses-summary" aria-label="Course purchase summary">
        <SummaryStat
          label="Total purchased"
          value={totalPurchased}
          hint="All enrollments on your account"
        />
        <SummaryStat
          label="Active access"
          value={activeAccessCount}
          hint="Courses you can learn from now"
        />
        <SummaryStat
          label="Paid enrollments"
          value={paidCount}
          hint="Completed payment confirmations"
        />
      </section>

      {totalPurchased === 0 ? (
        <article className="sp-panel sp-panel--empty sp-animate-in sp-animate-in--2">
          <h2 className="sp-panel__title">No courses yet</h2>
          <p className="sp-body">
            When you purchase a course, it will appear here with enrollment and payment details.
          </p>
          <Link to="/courses" className="sp-btn sp-btn--primary">
            Browse courses
          </Link>
        </article>
      ) : (
        <div className="sp-my-courses-list">
          {enrollments.map((enrollment, index) => (
            <CourseEnrollmentCard
              key={enrollment.id ?? `${enrollment.courseId}-${index}`}
              enrollment={enrollment}
              delay={Math.min(index + 2, 8)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
