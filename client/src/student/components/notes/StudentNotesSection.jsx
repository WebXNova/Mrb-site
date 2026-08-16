import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import { useMemo } from 'react';
import StudentNoteCard from './StudentNoteCard';
import { useStudentNotes } from '../../hooks/useStudentNotes';
import '../../styles/student-notes.css';

function NotesGroupBlock({ label, notes, downloadingId, onDownload, collapsible = false, defaultOpen = true }) {
  if (!notes.length) return null;

  const body = (
    <div className="student-notes__cards">
      {notes.map((note) => (
        <StudentNoteCard
          key={note.id}
          note={note}
          busy={downloadingId === note.id}
          onDownload={onDownload}
        />
      ))}
    </div>
  );

  if (!collapsible) {
    return (
      <section className="student-notes__block">
        {label ? <h4 className="student-notes__block-title">{label}</h4> : null}
        {body}
      </section>
    );
  }

  return (
    <details className="student-notes__block student-notes__block--collapsible" open={defaultOpen}>
      <summary className="student-notes__block-summary">
        <ExpandMoreOutlinedIcon className="student-notes__block-chevron" aria-hidden />
        <span className="student-notes__block-title">{label}</span>
        <span className="student-notes__block-count">
          {notes.length} file{notes.length === 1 ? '' : 's'}
        </span>
      </summary>
      {body}
    </details>
  );
}

export default function StudentNotesSection({
  courseId,
  subjectId = null,
  chapterId = null,
  lectureId = null,
  title = 'Notes',
  showSubjectSummary = false,
  subjectLabels = {},
}) {
  const { groups, loading, error, downloadingId, downloadNote, totalNotes } = useStudentNotes({
    courseId,
    subjectId,
    chapterId,
    lectureId,
  });

  const isCourseOverview = showSubjectSummary && !subjectId && !chapterId && !lectureId;

  const organizedSections = useMemo(() => {
    if (!isCourseOverview) {
      return {
        courseWide: [],
        subjectSections: [],
        contextualGroups: groups,
      };
    }

    const courseWide = [];
    const bySubject = new Map();

    for (const group of groups) {
      const notes = group.notes || [];
      if (!notes.length) continue;

      if (group.scopeLevel === 'course' || !group.subjectId) {
        courseWide.push(...notes);
        continue;
      }

      const key = String(group.subjectId);
      if (!bySubject.has(key)) {
        bySubject.set(key, {
          subjectId: group.subjectId,
          subjectTitle:
            subjectLabels[key] ||
            group.notes[0]?.scope?.subjectTitle ||
            `Subject ${group.subjectId}`,
          notes: [],
        });
      }
      bySubject.get(key).notes.push(...notes);
    }

    return {
      courseWide,
      subjectSections: Array.from(bySubject.values()).sort((a, b) =>
        String(a.subjectTitle).localeCompare(String(b.subjectTitle))
      ),
      contextualGroups: [],
    };
  }, [groups, isCourseOverview, subjectLabels]);

  const hasNotes = totalNotes > 0;
  const sectionId = `student-notes-${courseId}-${lectureId || chapterId || subjectId || 'course'}`;

  return (
    <section className="student-notes" aria-labelledby={sectionId}>
      <div className="student-notes__head">
        <div className="student-notes__head-copy">
          <h3 className="heading-4" id={sectionId}>
            {title}
          </h3>
          {!loading && hasNotes ? (
            <p className="student-notes__count">
              {totalNotes} file{totalNotes === 1 ? '' : 's'} available
            </p>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="student-notes__loading" role="status">
          <span className="student-notes__spinner student-notes__spinner--inline" aria-hidden />
          Loading notes…
        </div>
      ) : null}

      {error ? <p className="admin-error">{error}</p> : null}

      {!loading && !error && !hasNotes ? (
        <div className="student-notes__empty">
          <DescriptionOutlinedIcon className="student-notes__empty-icon" aria-hidden />
          <p className="student-notes__empty-title">No notes available yet</p>
          <p className="student-notes__empty-hint">
            Study materials will appear here when your instructor uploads them.
          </p>
        </div>
      ) : null}

      {!loading && !error && hasNotes && isCourseOverview ? (
        <div className="student-notes__dashboard">
          <NotesGroupBlock
            label="Course-wide"
            notes={organizedSections.courseWide}
            downloadingId={downloadingId}
            onDownload={downloadNote}
          />
          {organizedSections.subjectSections.length > 0 ? (
            <div className="student-notes__browse">
              <p className="student-notes__browse-label">Browse by subject</p>
              {organizedSections.subjectSections.map((section) => (
                <NotesGroupBlock
                  key={section.subjectId}
                  label={section.subjectTitle}
                  notes={section.notes}
                  downloadingId={downloadingId}
                  onDownload={downloadNote}
                  collapsible
                  defaultOpen={organizedSections.subjectSections.length <= 2}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && hasNotes && !isCourseOverview ? (
        <div className="student-notes__groups">
          {groups.map((group) => (
            <NotesGroupBlock
              key={`${group.scopeLabel}-${group.scopeLevel}`}
              label={group.scopeLabel}
              notes={group.notes}
              downloadingId={downloadingId}
              onDownload={downloadNote}
              collapsible={group.notes.length > 3}
              defaultOpen
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
