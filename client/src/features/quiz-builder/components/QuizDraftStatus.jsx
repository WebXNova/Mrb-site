/**
 * @param {{
 *   status: 'saved' | 'saving' | 'unsaved' | 'error' | 'offline',
 *   lastSavedAt?: string | null,
 *   saveError?: string,
 * }} props
 */
export default function QuizDraftStatus({ status, lastSavedAt, saveError = '' }) {
  let label = 'Saved';
  let className = 'qb-draft-status qb-draft-status--saved';

  if (status === 'saving') {
    label = 'Saving…';
    className = 'qb-draft-status qb-draft-status--saving';
  } else if (status === 'unsaved') {
    label = 'Unsaved changes';
    className = 'qb-draft-status qb-draft-status--unsaved';
  } else if (status === 'offline') {
    label = 'Saved locally — offline';
    className = 'qb-draft-status qb-draft-status--unsaved';
  } else if (status === 'error') {
    label = saveError || 'Save failed — fix validation errors';
    className = 'qb-draft-status qb-draft-status--error';
  } else if (lastSavedAt) {
    const time = new Date(lastSavedAt);
    if (!Number.isNaN(time.getTime())) {
      label = `Saved ${time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }
  }

  return (
    <span
      className={className}
      role="status"
      aria-live="polite"
      title={saveError || undefined}
      data-permission-error={saveError?.includes('permission') ? 'true' : undefined}
    >
      <span className="qb-draft-status__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
