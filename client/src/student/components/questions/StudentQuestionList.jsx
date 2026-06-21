import { Link } from 'react-router-dom';
import { qaSubjectEmoji, qaSubjectIconModifier } from '../../../constants/qaSubjects';
import { sanitizeQuestionPlainText } from '../../utils/sanitizeQuestionText';
import {
  studentQuestionReplyHint,
  studentQuestionStatusBadgeClass,
  studentQuestionStatusLabel,
} from '../../utils/studentQuestionStatus';

function subjectIconClass(subjectSlug) {
  const mod = qaSubjectIconModifier(subjectSlug);
  const base = 'sqachat-list__icon';
  return mod ? `${base} sqachat-list__icon--${mod}` : base;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function StudentQuestionList({ items = [], loading = false, error = '', onRetry }) {
  if (loading) {
    return (
      <section className="admin-card sqachat-panel" aria-busy="true" aria-label="Loading your questions">
        <p className="admin-stat-card__label">Loading your questions…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="admin-card sqachat-panel sqachat-panel--error">
        <p className="admin-error" role="alert">
          {error}
        </p>
        {onRetry ? (
          <button type="button" className="btn btn--secondary btn--sm sqachat-list__retry" onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </section>
    );
  }

  if (!items.length) {
    return (
      <section className="admin-card sqachat-panel sqachat-panel--empty" aria-label="No questions yet">
        <h3 className="heading-4 sqachat-list__empty-title">No questions yet</h3>
        <p className="admin-stat-card__label">
          When you ask a doubt, it will appear here with status updates and teacher replies.
        </p>
        <Link className="btn btn--primary btn--sm" to="/student/questions?tab=ask">
          Ask your first question
        </Link>
      </section>
    );
  }

  return (
    <div className="sqachat-list__items" role="list" aria-label="Your questions">
      {items.map((item) => {
        const safeTitle = sanitizeQuestionPlainText(item.title || item.bodyPreview || 'Question');
        const safePreview = sanitizeQuestionPlainText(item.bodyPreview || '');
        const status = item.status || 'sent';
        const replyHint = studentQuestionReplyHint(status, item.hasReply);

        return (
          <Link
            key={item.id}
            className="sqachat-list__item"
            to={`/student/questions/${item.id}`}
            role="listitem"
            aria-label={`${item.subjectLabel || 'Question'}: ${safeTitle}. Status: ${studentQuestionStatusLabel(status)}`}
          >
            <div className={subjectIconClass(item.subjectSlug)} aria-hidden>
              {qaSubjectEmoji(item.subjectSlug)}
            </div>
            <div className="sqachat-list__main">
              <p className="sqachat-list__subject">{item.subjectLabel || 'Subject'}</p>
              <p className="sqachat-list__title">{safeTitle}</p>
              <p className="sqachat-list__preview">{safePreview}</p>
              <p className="sqachat-list__reply-hint">{replyHint}</p>
            </div>
            <div className="sqachat-list__meta">
              <span className={`sqachat-badge ${studentQuestionStatusBadgeClass(status)}`}>
                {studentQuestionStatusLabel(status)}
              </span>
              <time className="sqachat-list__time" dateTime={item.updatedAt || item.createdAt}>
                {formatDate(item.updatedAt || item.createdAt)}
              </time>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
