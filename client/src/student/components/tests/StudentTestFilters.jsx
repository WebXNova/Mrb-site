import { useEffect, useId, useState } from 'react';
import StudentIcon from '../icons/StudentIcons';
import { useIsStudentMobileNav } from '../../hooks/useMediaQuery';

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
  loading = false,
  onSearchChange,
  onSubjectChange,
  onDateFilterChange,
  onAttemptFilterChange,
  onClear,
}) {
  const panelId = useId();
  const isMobile = useIsStudentMobileNav();
  const hasActiveFilters =
    search.trim().length > 0 ||
    subjectId !== 'all' ||
    dateFilter !== 'all' ||
    attemptFilter !== 'all';

  const [filtersOpen, setFiltersOpen] = useState(hasActiveFilters);

  useEffect(() => {
    if (hasActiveFilters) setFiltersOpen(true);
  }, [hasActiveFilters]);

  const advancedOpen = !isMobile || filtersOpen;
  const countLabel = loading
    ? 'Loading…'
    : `Showing ${resultCount} of ${totalCount} test${totalCount === 1 ? '' : 's'}`;

  return (
    <div className="student-test-filters">
      <div className="student-test-filters__toolbar">
        <label className="student-test-filters__field student-test-filters__field--search">
          <span className="student-test-filters__label">Search</span>
          <div className="student-test-filters__search-wrap">
            <StudentIcon name="search" size={18} className="student-test-filters__search-icon" />
            <input
              type="search"
              className="student-test-filters__input"
              placeholder="Search by test name or subject…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search tests"
            />
          </div>
        </label>

        <button
          type="button"
          className="student-test-filters__toggle"
          aria-expanded={advancedOpen}
          aria-controls={panelId}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <StudentIcon name="sliders" size={16} />
          Filters
          <StudentIcon
            name="chevron-down"
            size={16}
            className={`student-test-filters__chevron${advancedOpen ? ' is-open' : ''}`}
          />
        </button>
      </div>

      <div
        id={panelId}
        className={`student-test-filters__advanced${advancedOpen ? ' is-open' : ''}`}
      >
        <div className="student-test-filters__advanced-inner">
          <div className="student-test-filters__row">
            <label className="student-test-filters__field">
              <span className="student-test-filters__label">Subject</span>
              <select
                className="student-test-filters__select"
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

            <label className="student-test-filters__field">
              <span className="student-test-filters__label">Date</span>
              <select
                className="student-test-filters__select"
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

            <label className="student-test-filters__field">
              <span className="student-test-filters__label">Progress</span>
              <select
                className="student-test-filters__select"
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
          </div>
        </div>
      </div>

      <div className="student-test-filters__footer">
        <p className="student-test-filters__count" aria-live="polite">
          {countLabel}
        </p>
        {hasActiveFilters ? (
          <button type="button" className="student-test-filters__clear" onClick={onClear}>
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
