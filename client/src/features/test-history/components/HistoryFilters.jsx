export default function HistoryFilters({
  search,
  status,
  onSearchChange,
  onStatusChange,
  disabled,
}) {
  return (
    <section className="th-filters" aria-label="Filter results">
      <div className="th-filters__search">
        <label htmlFor="th-search">Search tests</label>
        <input
          id="th-search"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by test name…"
          disabled={disabled}
          autoComplete="off"
        />
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
    </section>
  );
}
