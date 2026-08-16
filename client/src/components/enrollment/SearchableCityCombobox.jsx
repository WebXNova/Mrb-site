import { useEffect, useId, useMemo, useRef, useState } from 'react';

export default function SearchableCityCombobox({
  label,
  value,
  onChange,
  options = [],
  loading = false,
  disabled = false,
  placeholder = 'Search or select city',
  error = '',
  prefilled = false,
  warning = '',
  fieldName = 'city_id',
}) {
  const listboxId = useId();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectedOption = useMemo(
    () => options.find((item) => String(item.id) === String(value)),
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((item) => item.name.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      setQuery(selectedOption?.name || '');
    }
  }, [selectedOption, open]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
        setQuery(selectedOption?.name || '');
        setActiveIndex(-1);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [selectedOption]);

  useEffect(() => {
    if (!open) {
      setActiveIndex(-1);
      return;
    }
    if (filteredOptions.length === 0) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((current) => (current >= 0 && current < filteredOptions.length ? current : 0));
  }, [open, filteredOptions]);

  const fieldClass = [
    'enrollment-field',
    'enrollment-city-combobox',
    prefilled ? 'enrollment-field--prefilled' : '',
    warning ? 'enrollment-field--prefill-warning' : '',
  ]
    .filter(Boolean)
    .join(' ');

  function handleInputChange(event) {
    const nextQuery = event.target.value;
    setQuery(nextQuery);
    setOpen(true);
    if (value) {
      onChange('');
    }
  }

  function handleSelect(item) {
    onChange(String(item.id));
    setQuery(item.name);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleInputFocus() {
    if (!disabled && !loading) {
      setOpen(true);
    }
  }

  function handleInputKeyDown(event) {
    if (disabled || loading) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        if (filteredOptions.length === 0) return -1;
        return current < filteredOptions.length - 1 ? current + 1 : 0;
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        if (filteredOptions.length === 0) return -1;
        return current > 0 ? current - 1 : filteredOptions.length - 1;
      });
      return;
    }

    if (event.key === 'Enter') {
      if (!open || activeIndex < 0 || !filteredOptions[activeIndex]) return;
      event.preventDefault();
      handleSelect(filteredOptions[activeIndex]);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setQuery(selectedOption?.name || '');
      setActiveIndex(-1);
    }
  }

  const inputPlaceholder = loading ? 'Loading cities...' : placeholder;
  const showEmptyState = open && !loading && filteredOptions.length === 0;

  return (
    <div className={fieldClass} data-field={fieldName || undefined} ref={rootRef}>
      <label htmlFor={`${listboxId}-input`}>
        {label} <span>*</span>
        {warning ? (
          <span className="enrollment-prefill-warning-icon" title={warning} aria-label={warning}>
            ⚠
          </span>
        ) : null}
      </label>

      <div className="enrollment-city-combobox__control">
        <input
          id={`${listboxId}-input`}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 && filteredOptions[activeIndex]
              ? `${listboxId}-option-${filteredOptions[activeIndex].id}`
              : undefined
          }
          value={query}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleInputKeyDown}
          placeholder={inputPlaceholder}
          disabled={disabled || loading}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {open && !disabled && !loading ? (
        <ul id={listboxId} className="enrollment-city-combobox__list" role="listbox">
          {filteredOptions.map((item, index) => (
            <li
              key={item.id}
              id={`${listboxId}-option-${item.id}`}
              role="option"
              aria-selected={String(item.id) === String(value)}
              className={[
                'enrollment-city-combobox__option',
                index === activeIndex ? 'enrollment-city-combobox__option--active' : '',
                String(item.id) === String(value) ? 'enrollment-city-combobox__option--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleSelect(item)}
            >
              {item.name}
            </li>
          ))}
          {showEmptyState ? (
            <li className="enrollment-city-combobox__empty" role="presentation">
              No cities match your search
            </li>
          ) : null}
        </ul>
      ) : null}

      {loading ? (
        <p className="enrollment-field__loading">
          <span className="enrollment-spinner" aria-hidden="true" />
          Loading...
        </p>
      ) : null}
      {error ? <p className="enrollment-field__error">{error}</p> : null}
      {warning && !error ? <p className="enrollment-field__prefill-warning">{warning}</p> : null}
    </div>
  );
}
