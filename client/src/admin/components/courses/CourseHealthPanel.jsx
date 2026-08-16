import {
  courseHealthStatusClass,
  courseHealthStatusLabel,
  evaluateCourseHealth,
} from '../../utils/courseHealth.utils';

function SeverityIcon({ severity }) {
  if (severity === 'critical') return <span aria-hidden>✕</span>;
  if (severity === 'warning') return <span aria-hidden>!</span>;
  return <span aria-hidden>✓</span>;
}

export default function CourseHealthPanel({
  course,
  pricing,
  batches,
  activeSubjectCount,
  compact = false,
  loading = false,
  unsavedNotes = [],
}) {
  const report = evaluateCourseHealth({ course, pricing, batches, activeSubjectCount });

  if (compact) {
    return (
      <div className={`course-health-badge ${courseHealthStatusClass(report.status)}`}>
        <span className="course-health-badge__dot" aria-hidden />
        {courseHealthStatusLabel(report.status)}
      </div>
    );
  }

  return (
    <section className="course-health-panel">
      <header className="course-health-panel__header">
        <div>
          <h3 className="course-health-panel__title">Course health</h3>
          <p className="course-health-panel__subtitle">
            Read-only checks against saved publish readiness. Fix issues in the tabs above.
          </p>
        </div>
        <div className={`course-health-badge course-health-badge--lg ${courseHealthStatusClass(report.status)}`}>
          <span className="course-health-badge__dot" aria-hidden />
          {courseHealthStatusLabel(report.status)}
        </div>
      </header>

      {loading ? (
        <p className="course-health-panel__empty">Refreshing saved course data…</p>
      ) : null}

      {!loading && unsavedNotes.length > 0 ? (
        <ul className="course-health-panel__list" aria-label="Unsaved changes">
          {unsavedNotes.map((note) => (
            <li key={note} className="course-health-item course-health-item--warning">
              <span className="course-health-item__icon course-health-item__icon--warning">
                <SeverityIcon severity="warning" />
              </span>
              <div className="course-health-item__body">
                <p className="course-health-item__message">{note}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="course-health-panel__summary">
        <div className="course-health-stat">
          <span className="course-health-stat__value">{report.summary.critical_count}</span>
          <span className="course-health-stat__label">Critical</span>
        </div>
        <div className="course-health-stat">
          <span className="course-health-stat__value">{report.summary.warning_count}</span>
          <span className="course-health-stat__label">Warnings</span>
        </div>
      </div>

      {!loading && report.checks.length === 0 ? (
        <p className="course-health-panel__empty">All checks passed — course is ready.</p>
      ) : null}

      {!loading && report.checks.length > 0 ? (
        <ul className="course-health-panel__list">
          {report.checks.map((check) => (
            <li
              key={check.code}
              className={`course-health-item course-health-item--${check.severity}`}
            >
              <span className={`course-health-item__icon course-health-item__icon--${check.severity}`}>
                <SeverityIcon severity={check.severity} />
              </span>
              <div className="course-health-item__body">
                <p className="course-health-item__message">{check.message}</p>
                <p className="course-health-item__code">{check.code}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
