import { Link } from 'react-router-dom';

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateRange(start, end) {
  const startLabel = formatDate(start);
  const endLabel = formatDate(end);
  if (startLabel && endLabel) return `${startLabel} – ${endLabel}`;
  if (startLabel) return `From ${startLabel}`;
  if (endLabel) return `Until ${endLabel}`;
  return 'Open schedule';
}

function statusLabel(status) {
  if (status === 'in_progress') return 'In progress';
  if (status === 'completed') return 'Completed';
  return 'Not attempted';
}

function statusTone(status) {
  if (status === 'in_progress') return 'student-test-card__badge--progress';
  if (status === 'completed') return 'student-test-card__badge--done';
  return 'student-test-card__badge--new';
}

function actionLabel(status) {
  if (status === 'in_progress') return 'Resume test';
  if (status === 'completed') return 'View results';
  return 'Start test';
}

export default function StudentTestCard({ test }) {
  const slug = test.public_slug || test.slug;
  const href = slug ? `/tests/${encodeURIComponent(String(slug))}` : null;
  const resultsHref =
    test.status === 'completed' && slug
      ? `/dashboard/tests/history`
      : href;

  const linkTo = test.status === 'completed' ? resultsHref : href;
  const subject = test.subject_label || test.category || 'General';
  const duration = Number(test.duration_minutes ?? test.durationMinutes ?? 0);

  return (
    <article className="student-test-card sp-card">
      <div className="student-test-card__head">
        <h3 className="student-test-card__title">{test.title}</h3>
        <span className={`student-test-card__badge ${statusTone(test.status)}`}>
          {statusLabel(test.status)}
        </span>
      </div>

      <dl className="student-test-card__meta">
        <div>
          <dt>Subject</dt>
          <dd>{subject}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{duration > 0 ? `${duration} min` : '—'}</dd>
        </div>
        <div>
          <dt>Schedule</dt>
          <dd>{formatDateRange(test.start_date, test.end_date)}</dd>
        </div>
        {test.attempts_used > 0 ? (
          <div>
            <dt>Attempts</dt>
            <dd>
              {test.attempts_used}
              {test.max_attempts ? ` / ${test.max_attempts}` : ''}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="student-test-card__actions">
        {linkTo ? (
          <Link className="sp-btn sp-btn--primary sp-btn--sm" to={linkTo}>
            {actionLabel(test.status)}
          </Link>
        ) : (
          <span className="student-test-card__unavailable">Test link unavailable</span>
        )}
      </div>
    </article>
  );
}
