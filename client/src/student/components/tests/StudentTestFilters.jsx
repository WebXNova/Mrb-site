import StudentIcon from '../icons/StudentIcons';

const DATE_OPTIONS = [
  { value: 'all', label: 'All dates' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'active', label: 'Active now' },
  { value: 'past', label: 'Past' },
];

const ATTEMPT_OPTIONS = [
  { value: 'all', label: 'All tests' },
  { value: 'available', label: 'Not attempted' },
  { value: 'completed', label: 'Completed' },
];

export default function StudentTestFilters({
  search,
  subjectId,
  dateFilter,
  attemptFilter,
  subjects,
  resultCount,
  totalCount,
  onSearchChange,
  onSubjectChange,
  onDateFilterChange,
  onAttemptFilterChange,
  onClear,
}) {
  const hasActiveFilters =
    search.trim().length > 0 ||
    subjectId !== 'all' ||
    dateFilter !== 'all' ||
    attemptFilter !== 'all';

  return (
    <div className="student-lecture-filters student-test-filters">
      <div className="student-lecture-filters__row">
        <label className="student-lecture-filters__field student-lecture-filters__field--search">
          <span className="student-lecture-filters__label">Search</span>
          <div className="student-lecture-filters__search-wrap sp-search">
            <StudentIcon name="search" size={18} className="sp-search__icon" />
            <input
              type="search"
              className="student-lecture-filters__input sp-search__input"
              placeholder="Search by test name or subject…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search tests"
            />
          </div>
        </label>

        <label className="student-lecture-filters__field">
          <span className="student-lecture-filters__label">Subject</span>
          <select
            className="student-lecture-filters__select"
            value={subjectId}
            onChange={(e) => onSubjectChange(e.target.value)}
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
          <span className="student-lecture-filters__label">Date</span>
          <select
            className="student-lecture-filters__select"
            value={dateFilter}
            onChange={(e) => onDateFilterChange(e.target.value)}
            aria-label="Filter by schedule date"
          >
            {DATE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="student-lecture-filters__field">
          <span className="student-lecture-filters__label">Progress</span>
          <select
            className="student-lecture-filters__select"
            value={attemptFilter}
            onChange={(e) => onAttemptFilterChange(e.target.value)}
            aria-label="Filter by attempt status"
          >
            {ATTEMPT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
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

      <p className="student-lecture-filters__count">
        Showing {resultCount} of {totalCount} test{totalCount === 1 ? '' : 's'}
      </p>
    </div>
  );
}
