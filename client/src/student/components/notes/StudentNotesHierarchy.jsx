import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import StudentNoteCard from './StudentNoteCard';

function NoteCards({ notes, downloadingId, onDownload }) {
  if (!notes.length) return null;
  return (
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
}

function CollapsibleSection({ title, count, children, defaultOpen = true }) {
  if (!count) return null;
  return (
    <details className="student-notes-hierarchy__section" open={defaultOpen}>
      <summary className="student-notes-hierarchy__summary">
        <ExpandMoreOutlinedIcon className="student-notes-hierarchy__chevron" aria-hidden />
        <span className="student-notes-hierarchy__title">{title}</span>
        <span className="student-notes-hierarchy__count">
          {count} file{count === 1 ? '' : 's'}
        </span>
      </summary>
      <div className="student-notes-hierarchy__body">{children}</div>
    </details>
  );
}

export default function StudentNotesHierarchy({ hierarchy, downloadingId, onDownload }) {
  const { courseWide, subjects } = hierarchy;

  return (
    <div className="student-notes-hierarchy">
      {courseWide.length > 0 ? (
        <section className="student-notes-hierarchy__block">
          <h3 className="student-notes-hierarchy__heading">Course-wide</h3>
          <NoteCards notes={courseWide} downloadingId={downloadingId} onDownload={onDownload} />
        </section>
      ) : null}

      {subjects.map((subject) => {
        const subjectCount =
          subject.subjectNotes.length +
          subject.chapters.reduce(
            (sum, chapter) =>
              sum +
              chapter.chapterNotes.length +
              chapter.lectures.reduce((lectureSum, lecture) => lectureSum + lecture.notes.length, 0),
            0
          );

        return (
          <CollapsibleSection
            key={subject.id}
            title={subject.title}
            count={subjectCount}
            defaultOpen={subjects.length <= 3}
          >
            {subject.subjectNotes.length > 0 ? (
              <div className="student-notes-hierarchy__tier">
                <p className="student-notes-hierarchy__tier-label">Subject notes</p>
                <NoteCards
                  notes={subject.subjectNotes}
                  downloadingId={downloadingId}
                  onDownload={onDownload}
                />
              </div>
            ) : null}

            {subject.chapters.map((chapter) => {
              const chapterCount =
                chapter.chapterNotes.length +
                chapter.lectures.reduce((sum, lecture) => sum + lecture.notes.length, 0);

              return (
                <CollapsibleSection
                  key={`${subject.id}-${chapter.id}`}
                  title={chapter.title}
                  count={chapterCount}
                  defaultOpen={subject.chapters.length <= 4}
                >
                  {chapter.chapterNotes.length > 0 ? (
                    <div className="student-notes-hierarchy__tier">
                      <p className="student-notes-hierarchy__tier-label">Chapter notes</p>
                      <NoteCards
                        notes={chapter.chapterNotes}
                        downloadingId={downloadingId}
                        onDownload={onDownload}
                      />
                    </div>
                  ) : null}

                  {chapter.lectures.map((lecture) => (
                    <CollapsibleSection
                      key={`${subject.id}-${chapter.id}-${lecture.id}`}
                      title={lecture.title}
                      count={lecture.notes.length}
                      defaultOpen
                    >
                      <NoteCards
                        notes={lecture.notes}
                        downloadingId={downloadingId}
                        onDownload={onDownload}
                      />
                    </CollapsibleSection>
                  ))}
                </CollapsibleSection>
              );
            })}
          </CollapsibleSection>
        );
      })}
    </div>
  );
}
