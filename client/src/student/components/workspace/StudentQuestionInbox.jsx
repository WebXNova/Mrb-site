import { sanitizeQuestionPlainText } from '../../utils/sanitizeQuestionText';
import { qaSubjectAvatarLetters, qaSubjectEmoji } from '../../../constants/qaSubjects';
import { studentQuestionStatusLabel } from '../../utils/studentQuestionStatus';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'sent', label: 'Waiting' },
  { id: 'seen', label: 'Seen' },
];

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function subjectAvatar(item) {
  if (item.subjectSlug) return qaSubjectAvatarLetters(item.subjectSlug);
  const label = String(item.subjectLabel || 'S');
  return label.slice(0, 2).toUpperCase();
}

export default function StudentQuestionInbox({
  items,
  summary,
  course,
  statusFilter,
  onStatusFilter,
  search,
  onSearch,
  searchRef,
  selectedId,
  onSelect,
  listLoading,
  listError,
  onRetry,
}) {
  function renderRow(item, selected) {
    const preview = item.bodyPreview
      ? sanitizeQuestionPlainText(item.bodyPreview)
      : 'Tap to ask your first question';
    const subjectLabel = sanitizeQuestionPlainText(item.subjectLabel || 'Subject');
    const courseName = sanitizeQuestionPlainText(item.courseName || course?.title || 'Course');

    return (
      <button
        type="button"
        className={`tq-ws-inbox__item${selected ? ' tq-ws-inbox__item--active' : ''}${item.isWaiting ? ' tq-ws-inbox__item--unread' : ''}`}
        onClick={() => onSelect(item.threadId)}
      >
        <span className="tq-ws-inbox__avatar" aria-hidden>
          {item.subjectSlug ? qaSubjectEmoji(item.subjectSlug) : subjectAvatar(item)}
        </span>
        <span className="tq-ws-inbox__item-body">
          <div className="tq-ws-inbox__item-top">
            <span className="tq-ws-inbox__student">{subjectLabel}</span>
            <span className="tq-ws-inbox__time">{formatWhen(item.lastActivityAt)}</span>
          </div>
          <p className="tq-ws-inbox__preview">{preview}</p>
          <div className="tq-ws-inbox__item-foot">
            <span className="tq-ws-inbox__meta-line">{courseName}</span>
            {item.isWaiting ? <span className="tq-ws-inbox__unread-badge">!</span> : null}
            {item.hasReply ? (
              <span className="tq-ws-inbox__status-pill">{studentQuestionStatusLabel('answered')}</span>
            ) : item.messageCount > 0 ? (
              <span className="tq-ws-inbox__status-pill tq-ws-inbox__status-pill--waiting">Waiting</span>
            ) : null}
          </div>
        </span>
      </button>
    );
  }

  return (
    <aside className="tq-ws__sidebar tq-ws__sidebar--left" aria-label="Subject chats">
      <div className="tq-ws-inbox__toolbar">
        <input
          ref={searchRef}
          type="search"
          className="tq-ws-inbox__search"
          placeholder="Search subject or question…"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          aria-label="Search subject chats"
        />
      </div>

      <div className="tq-ws-inbox__filters" role="tablist" aria-label="Filter by status">
        {FILTERS.map((filter) => {
          const count =
            filter.id === 'all' ? (summary.subjects ?? items.length) : (summary[filter.id] ?? 0);
          const active = statusFilter === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`tq-ws-inbox__filter${active ? ' tq-ws-inbox__filter--active' : ''}`}
              onClick={() => onStatusFilter(filter.id)}
            >
              {filter.label}
              <span className="tq-ws-inbox__filter-count">{count}</span>
            </button>
          );
        })}
      </div>

      {listLoading ? (
        <p className="tq-ws-inbox__state">Loading subject chats…</p>
      ) : listError ? (
        <div className="tq-ws-inbox__state">
          <p className="admin-error" role="alert">{listError}</p>
          {onRetry ? (
            <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : !items.length ? (
        <p className="tq-ws-inbox__state">No subjects match your filters.</p>
      ) : (
        <div className="tq-ws-inbox__list" role="listbox" aria-label="Subject chats">
          {items.map((item) => (
            <div key={item.threadId} role="option" aria-selected={String(item.threadId) === String(selectedId)}>
              {renderRow(item, String(item.threadId) === String(selectedId))}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
