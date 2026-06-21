import { sanitizeQuestionPlainText } from '../../../student/utils/sanitizeQuestionText';

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export default function TeacherQuestionContextPanel({ context, loading, threadOpen }) {
  if (!threadOpen) {
    return (
      <aside className="tq-ws__sidebar tq-ws__sidebar--right tq-ws-context--empty" aria-label="Student context">
        <p className="admin-stat-card__label">Select a student chat to view context.</p>
      </aside>
    );
  }

  if (loading || !context) {
    return (
      <aside className="tq-ws__sidebar tq-ws__sidebar--right" aria-busy="true" aria-label="Student context">
        <p className="admin-stat-card__label">Loading context…</p>
      </aside>
    );
  }

  return (
    <aside className="tq-ws__sidebar tq-ws__sidebar--right" aria-label="Student context">
      <h3 className="tq-ws-context__title">Student</h3>
      <dl className="tq-ws-context__list">
        <div className="tq-ws-context__row">
          <dt>Name</dt>
          <dd>{sanitizeQuestionPlainText(context.studentName)}</dd>
        </div>
        <div className="tq-ws-context__row">
          <dt>Course</dt>
          <dd>{sanitizeQuestionPlainText(context.courseName)}</dd>
        </div>
        <div className="tq-ws-context__row">
          <dt>Subject</dt>
          <dd>{sanitizeQuestionPlainText(context.subjectName)}</dd>
        </div>
        <div className="tq-ws-context__row">
          <dt>Questions asked</dt>
          <dd>{context.questionCount ?? 0}</dd>
        </div>
        <div className="tq-ws-context__row">
          <dt>Last activity</dt>
          <dd>
            <time dateTime={context.lastActivityAt || undefined}>{formatWhen(context.lastActivityAt)}</time>
          </dd>
        </div>
      </dl>

      <div className="tq-ws-context__tips">
        <h4 className="tq-ws-context__tips-title">Shortcuts</h4>
        <ul className="tq-ws-context__tips-list">
          <li><kbd>j</kbd> next chat</li>
          <li><kbd>k</kbd> previous chat</li>
          <li><kbd>/</kbd> focus search</li>
          <li>Drafts auto-save locally</li>
        </ul>
      </div>
    </aside>
  );
}
