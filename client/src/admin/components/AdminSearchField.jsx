export default function AdminSearchField({ id = 'admin-search', value, onChange, onClear, placeholder = 'Search…', label = 'Search' }) {
  return (
    <div className="admin-search-field">
      <label className="admin-search-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="admin-search-field__control">
        <input
          id={id}
          type="search"
          className="admin-search-field__input"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete="off"
          aria-label={label}
        />
        {value ? (
          <button
            type="button"
            className="admin-search-field__clear"
            onClick={onClear}
            aria-label="Clear search"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}
