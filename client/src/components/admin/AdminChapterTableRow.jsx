import { formatAdminDate } from './adminSafeMessages';
import { AdminChapterRowActions } from './AdminChapterRowActions';

/**
 * @typedef {Record<string, unknown>} ChapterRowDto
 */

/**
 * @param {{
 *   chapter: ChapterRowDto,
 *   rowBusy: boolean,
 *   archiving: boolean,
 *   onEditChapter: () => void,
 *   onArchiveChapter: () => void,
 * }} props
 */
export function AdminChapterTableRow({ chapter, rowBusy, archiving, onEditChapter, onArchiveChapter }) {
  return (
    <tr>
      <td>{chapter.title || '—'}</td>
      <td>{chapter.courseTitle || '—'}</td>
      <td>{chapter.subjectTitle || '—'}</td>
      <td>{chapter.orderIndex ?? 0}</td>
      <td>{chapter.isActive ? 'Active' : 'Archived'}</td>
      <td>{formatAdminDate(chapter.createdAt)}</td>
      <td>
        <AdminChapterRowActions
          chapterTitle={typeof chapter.title === 'string' ? chapter.title : ''}
          isArchived={!chapter.isActive}
          disabled={rowBusy}
          archiving={archiving}
          onEdit={onEditChapter}
          onArchive={onArchiveChapter}
        />
      </td>
    </tr>
  );
}
