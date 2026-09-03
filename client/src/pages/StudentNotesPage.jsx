import { useEffect, useMemo, useState } from 'react';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import StudentIcon from '../student/components/icons/StudentIcons';
import StudentNotesHierarchy from '../student/components/notes/StudentNotesHierarchy';
import { useStudentEnrolledCourses } from '../student/hooks/useStudentEnrolledCourses';
import { useStudentNotes } from '../student/hooks/useStudentNotes';
import {
  buildNotesHierarchy,
  countNotesInHierarchy,
  filterNotesHierarchy,
} from '../student/utils/groupStudentNotesHierarchy';
import '../student/styles/student-notes.css';

export default function StudentNotesPage() {
  const { courses: courseTabs, loading: coursesLoading, error: coursesError } = useStudentEnrolledCourses();
  const [courseId, setCourseId] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (courseTabs.length === 1) {
      setCourseId(courseTabs[0].id);
      return;
    }
    if (courseId !== 'all' && !courseTabs.some((tab) => tab.id === courseId)) {
      setCourseId('all');
    }
  }, [courseTabs, courseId]);

  const activeCourseId = useMemo(() => {
    if (courseId !== 'all') {
      const selected = Number(courseId);
      return Number.isInteger(selected) && selected > 0 ? selected : null;
    }
    if (courseTabs.length === 1) {
      const only = Number(courseTabs[0].id);
      return Number.isInteger(only) && only > 0 ? only : null;
    }
    return null;
  }, [courseId, courseTabs]);

  const { groups, loading, error: notesError, downloadingId, downloadNote, totalNotes } = useStudentNotes({
    courseId: activeCourseId,
  });

  const hierarchy = useMemo(() => buildNotesHierarchy(groups), [groups]);
  const filteredHierarchy = useMemo(
    () => filterNotesHierarchy(hierarchy, search),
    [hierarchy, search]
  );
  const visibleCount = useMemo(
    () => countNotesInHierarchy(filteredHierarchy),
    [filteredHierarchy]
  );

  const pageLoading = coursesLoading || (activeCourseId != null && loading);
  const error = coursesError || notesError;
  const needsCoursePick = !coursesLoading && courseTabs.length > 1 && courseId === 'all';
  const noEnrolledCourse = !coursesLoading && !error && courseTabs.length === 0;

  return (
    <section className="student-notes-page sp-panel sp-card">
      <div className="student-page-header student-notes-page__header">
        <div>
          <h2 className="heading-3 student-notes-page__title">Notes</h2>
          <p className="student-notes-page__lead">
            Download study materials organized by subject, chapter, and lecture for your enrolled course.
          </p>
        </div>
      </div>

      {courseTabs.length > 1 ? (
        <div className="student-lecture-tabs student-notes-page__course-tabs" role="tablist" aria-label="Select course">
          {courseTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={courseId === tab.id}
              className={`student-lecture-tab ${courseId === tab.id ? 'student-lecture-tab--active' : ''}`}
              onClick={() => setCourseId(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : courseTabs.length === 1 ? (
        <p className="student-notes-page__course-label">{courseTabs[0].label}</p>
      ) : null}

      {!needsCoursePick && activeCourseId != null ? (
        <div className="student-notes-page__search sp-search">
          <StudentIcon name="search" size={18} className="sp-search__icon" />
          <input
            type="search"
            className="student-notes-page__search-input sp-search__input"
            placeholder="Search notes by title or description…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search notes"
          />
        </div>
      ) : null}

      {pageLoading ? (
        <div className="student-notes__loading" role="status">
          <span className="student-notes__spinner student-notes__spinner--inline" aria-hidden />
          Loading notes…
        </div>
      ) : null}

      {error ? <p className="admin-error">{error}</p> : null}

      {needsCoursePick ? (
        <div className="student-notes__empty student-notes-page__pick-course">
          <DescriptionOutlinedIcon className="student-notes__empty-icon" aria-hidden />
          <p className="student-notes__empty-title">Select a course</p>
          <p className="student-notes__empty-hint">Choose a course above to view its notes.</p>
        </div>
      ) : null}

      {noEnrolledCourse ? (
        <div className="student-notes__empty">
          <DescriptionOutlinedIcon className="student-notes__empty-icon" aria-hidden />
          <p className="student-notes__empty-title">No notes available</p>
          <p className="student-notes__empty-hint">
            Notes appear here after you have an active course enrollment.
          </p>
        </div>
      ) : null}

      {!pageLoading && !error && !needsCoursePick && activeCourseId != null && totalNotes === 0 ? (
        <div className="student-notes__empty">
          <DescriptionOutlinedIcon className="student-notes__empty-icon" aria-hidden />
          <p className="student-notes__empty-title">No notes available</p>
          <p className="student-notes__empty-hint">
            Study materials will appear here when your instructor uploads them.
          </p>
        </div>
      ) : null}

      {!pageLoading && !error && !needsCoursePick && activeCourseId != null && totalNotes > 0 ? (
        <>
          <p className="student-notes-page__count" aria-live="polite">
            Showing {visibleCount} of {totalNotes} file{totalNotes === 1 ? '' : 's'}
          </p>
          {visibleCount === 0 ? (
            <div className="student-notes__empty">
              <p className="student-notes__empty-title">No notes match your search</p>
              <p className="student-notes__empty-hint">Try a different keyword or clear the search box.</p>
            </div>
          ) : (
            <StudentNotesHierarchy
              hierarchy={filteredHierarchy}
              downloadingId={downloadingId}
              onDownload={downloadNote}
            />
          )}
        </>
      ) : null}
    </section>
  );
}
