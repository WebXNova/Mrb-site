import StudentIcon from '../icons/StudentIcons';

/**
 * @param {{
 *   subjects: Array<{ id: string, title: string }>,
 *   chapters: Array<{ id: string, title: string, subjectId: string }>,
 *   courseTabs?: Array<{ id: string, label: string }>,
 *   subjectId: string,
 *   chapterId: string,
 *   courseId: string,
 *   search: string,
 *   resultCount: number,
 *   totalCount: number,
 *   onSubjectChange: (value: string) => void,
 *   onChapterChange: (value: string) => void,
 *   onCourseChange?: (value: string) => void,
 *   onSearchChange: (value: string) => void,
 *   onClear: () => void,
 * }} props
 */
export default function StudentLectureFilters({
  subjects,
  chapters,
  courseTabs = [],
  subjectId,
  chapterId,
  courseId,
  search,
  resultCount,
  totalCount,
  onSubjectChange,
  onChapterChange,
  onCourseChange,
  onSearchChange,
  onClear,
}) {
  const chapterOptions =
    subjectId === 'all' ? chapters : chapters.filter((chapter) => chapter.subjectId === subjectId);

  const hasActiveFilters =
    subjectId !== 'all' || chapterId !== 'all' || courseId !== 'all' || search.trim().length > 0;

  return (
    <div className="student-lecture-filters">
      <div className="student-lecture-filters__row">
        <label className="student-lecture-filters__field student-lecture-filters__field--search">
          <span className="student-lecture-filters__label">Search</span>
          <div className="student-lecture-filters__search-wrap sp-search">
            <StudentIcon name="search" size={18} className="sp-search__icon" />
            <input
              type="search"
              className="student-lecture-filters__input sp-search__input"
              placeholder="Search by title, subject, or chapter…"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              aria-label="Search lectures"
            />
          </div>
        </label>

        <label className="student-lecture-filters__field">
          <span className="student-lecture-filters__label">Subject</span>
          <select
            className="student-lecture-filters__select"
            value={subjectId}
            onChange={(event) => onSubjectChange(event.target.value)}
            aria-label="Filter by subject"
          >
            <option value="all">All subjects</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.title}
              </option>
            ))}
          </select>
        </label>

        <label className="student-lecture-filters__field">
          <span className="student-lecture-filters__label">Chapter</span>
          <select
            className="student-lecture-filters__select"
            value={chapterId}
            onChange={(event) => onChapterChange(event.target.value)}
            aria-label="Filter by chapter"
            disabled={!chapterOptions.length}
          >
            <option value="all">All chapters</option>
            {chapterOptions.map((chapter) => (
              <option key={`${chapter.subjectId}-${chapter.id}`} value={chapter.id}>
                {chapter.title}
              </option>
            ))}
          </select>
        </label>

        {hasActiveFilters ? (
          <button type="button" className="btn btn--ghost btn--sm student-lecture-filters__clear" onClick={onClear}>
            Clear filters
          </button>
        ) : null}
      </div>

      {courseTabs.length > 1 && onCourseChange ? (
        <div className="student-lecture-tabs" role="tablist" aria-label="Filter by course">
          <button
            type="button"
            role="tab"
            aria-selected={courseId === 'all'}
            className={`student-lecture-tab ${courseId === 'all' ? 'student-lecture-tab--active' : ''}`}
            onClick={() => onCourseChange('all')}
          >
            All courses
          </button>
          {courseTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={courseId === tab.id}
              className={`student-lecture-tab ${courseId === tab.id ? 'student-lecture-tab--active' : ''}`}
              onClick={() => onCourseChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      <p className="student-lecture-filters__count" aria-live="polite">
        Showing {resultCount} of {totalCount} lecture{totalCount === 1 ? '' : 's'}
      </p>
    </div>
  );
}
