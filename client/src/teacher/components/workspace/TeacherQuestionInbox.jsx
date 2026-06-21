import { sanitizeQuestionPlainText } from '../../../student/utils/sanitizeQuestionText';
import VirtualInboxList from './VirtualInboxList';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'sent', label: 'Sent' },
  { id: 'seen', label: 'Seen' },
];

function studentAvatarLetters(name) {
  return String(name || 'S')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'S';
}

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TeacherQuestionInbox({
  items,
  summary,
  statusFilter,
  onStatusFilter,
  search,
  onSearch,
  searchRef,
  pinnedOnly,
  onPinnedOnly,
  selectedId,
  onSelect,
  onTogglePin,
  listLoading,
  listError,
  onRetry,
  onLoadMore,
  hasMore,
  listLoadingMore,
}) {
  function renderRow(item, selected) {
    const preview = sanitizeQuestionPlainText(item.bodyPreview || '');
    const studentName = sanitizeQuestionPlainText(item.studentName || 'Student');
    return (
      <button
        type="button"
        className={`tq-ws-inbox__item${selected ? ' tq-ws-inbox__item--active' : ''}${item.isUnread ? ' tq-ws-inbox__item--unread' : ''}`}
        onClick={() => onSelect(item.threadId)}
      >
        <span className="tq-ws-inbox__avatar" aria-hidden>
          {studentAvatarLetters(studentName)}
        </span>
        <span className="tq-ws-inbox__item-body">
          <div className="tq-ws-inbox__item-top">
            <span className="tq-ws-inbox__student">{studentName}</span>
            <span className="tq-ws-inbox__time">{formatWhen(item.lastActivityAt)}</span>
          </div>
          <p className="tq-ws-inbox__preview">
            {item.isPinned ? <span className="tq-ws-inbox__pin" title="Pinned">📌 </span> : null}
            {preview}
          </p>
          <div className="tq-ws-inbox__item-foot">
            <span className="tq-ws-inbox__meta-line">
              {sanitizeQuestionPlainText(item.subjectName || 'Subject')}
              <span aria-hidden> · </span>
              {sanitizeQuestionPlainText(item.courseName || 'Course')}
            </span>
            {item.unreadCount > 0 ? (
              <span className="tq-ws-inbox__unread-badge" aria-label={`${item.unreadCount} unread`}>
                {item.unreadCount}
              </span>
            ) : null}
            {item.latestQuestionId ? (
              <button
                type="button"
                className="tq-ws-inbox__pin-btn"
                aria-label={item.isPinned ? 'Unpin conversation' : 'Pin conversation'}
                onClick={(event) => {
                  event.stopPropagation();
                  onTogglePin(item.latestQuestionId, !item.isPinned);
                }}
              >
                {item.isPinned ? 'Unpin' : 'Pin'}
              </button>
            ) : null}
          </div>
        </span>
      </button>
    );
  }

  return (
    <aside className="tq-ws__sidebar tq-ws__sidebar--left" aria-label="Student chats">
      <div className="tq-ws-inbox__toolbar">
        <input
          ref={searchRef}
          type="search"
          className="tq-ws-inbox__search"
          placeholder="Search student, subject, course, question…"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          aria-label="Search questions"
        />
        <label className="tq-ws-inbox__pinned-toggle">
          <input type="checkbox" checked={pinnedOnly} onChange={(event) => onPinnedOnly(event.target.checked)} />
          Pinned only
        </label>
      </div>

      <div className="tq-ws-inbox__filters" role="tablist" aria-label="Filter by status">
        {FILTERS.map((filter) => {
          const count = filter.id === 'all' ? summary.all : (summary[filter.id] ?? 0);
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

      {summary.unread > 0 ? (
        <p className="tq-ws-inbox__unread-summary" aria-live="polite">
          {summary.unread} unread
        </p>
      ) : null}

      {listLoading ? (
        <p className="tq-ws-inbox__state">Loading questions…</p>
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
        <p className="tq-ws-inbox__state">No questions match your filters.</p>
      ) : (
        <VirtualInboxList
          items={items}
          selectedId={selectedId}
          onSelect={onSelect}
          onEndReached={onLoadMore}
          hasMore={hasMore}
          loadingMore={listLoadingMore}
          renderRow={renderRow}
        />
      )}
    </aside>
  );
}
