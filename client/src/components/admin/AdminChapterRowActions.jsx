import { memo } from 'react';

/**
 * Memoized privileged row actions — archive-only delete policy.
 * @param {{
 *   chapterTitle: string,
 *   isArchived: boolean,
 *   disabled: boolean,
 *   archiving: boolean,
 *   onEdit: () => void,
 *   onArchive: () => void,
 * }} props
 */
function AdminChapterRowActionsPlain({
  chapterTitle,
  isArchived,
  disabled,
  archiving,
  onEdit,
  onArchive,
}) {
  const labelSuffix = chapterTitle ? ` (${chapterTitle})` : '';

  return (
    <div className="admin-row-actions">
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        onClick={onEdit}
        disabled={disabled}
        aria-label={`Edit chapter${labelSuffix}`}
      >
        Edit
      </button>
      <button
        type="button"
        className="btn btn--danger btn--sm"
        onClick={onArchive}
        disabled={disabled || isArchived}
        aria-busy={archiving}
        aria-label={archiving ? 'Archiving chapter' : `Archive chapter${labelSuffix}`}
      >
        {archiving ? 'Archiving…' : 'Archive'}
      </button>
    </div>
  );
}

export const AdminChapterRowActions = memo(AdminChapterRowActionsPlain);
