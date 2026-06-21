import StudentIcon from '../../../student/components/icons/StudentIcons';

const DATE_OPTIONS = [
  { value: 'all', label: 'All dates' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
];

export default function HistoryFilters({
  search,
  status,
  subjectId,
  dateRange,
  submittedDate,
  subjects,
  resultCount,
  totalCount,
  onSearchChange,
  onStatusChange,
  onSubjectChange,
  onDateRangeChange,
  onSubmittedDateChange,
  onClear,
  disabled,
}) {
  const hasActiveFilters =
    Boolean(search.trim()) ||
    status !== 'all' ||
    subjectId !== 'all' ||
    dateRange !== 'all' ||
    Boolean(submittedDate);

  return (
    <section className="th-filters th-filters--dark" aria-label="Filter results">
      <div className="th-filters__row th-filters__row--enhanced">
        <label className="th-filters__field th-filters__field--search">
          <span className="th-filters__label">Search</span>
          <div className="th-filters__search-wrap">
            <StudentIcon name="search" size={18} className="th-filters__search-icon" />
            <input
              id="th-search"
              type="search"
              className="th-filters__input"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search by test or subject…"
              disabled={disabled}
              autoComplete="off"
              aria-label="Search results"
            />
          </div>
        </label>

        <label className="th-filters__field">
          <span className="th-filters__label">Subject</span>
          <select
            className="th-filters__select"
            value={subjectId}
            onChange={(event) => onSubjectChange(event.target.value)}
            disabled={disabled}
            aria-label="Filter by subject"
          >
            <option value="all">All subjects</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={String(subject.id)}>
                {subject.title}
              </option>
            ))}
          </select>
        </label>

        <label className="th-filters__field">
          <span className="th-filters__label">Submitted</span>
          <select
            className="th-filters__select"
            value={dateRange}
            onChange={(event) => onDateRangeChange(event.target.value)}
            disabled={disabled || Boolean(submittedDate)}
            aria-label="Filter by submission date range"
          >
            {DATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="th-filters__field">
          <span className="th-filters__label">On date</span>
          <input
            type="date"
            className="th-filters__date"
            value={submittedDate}
            onChange={(event) => onSubmittedDateChange(event.target.value)}
            disabled={disabled}
            aria-label="Filter by exact submission date"
          />
        </label>

        {hasActiveFilters ? (
          <button
            type="button"
            className="th-filters__clear"
            onClick={onClear}
            disabled={disabled}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <div className="th-filters__status">
        <span className="th-filters__status-label" id="th-status-label">
          Result
        </span>
        <div className="th-filters__status-group" role="group" aria-labelledby="th-status-label">
          {[
            { value: 'all', label: 'All' },
            { value: 'pass', label: 'Pass' },
            { value: 'fail', label: 'Fail' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              className={`th-filters__chip ${status === option.value ? 'th-filters__chip--active' : ''}`}
              onClick={() => onStatusChange(option.value)}
              disabled={disabled}
              aria-pressed={status === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className="th-filters__count" aria-live="polite">
        Showing {resultCount} of {totalCount} result{totalCount === 1 ? '' : 's'}
      </p>
    </section>
  );
}
