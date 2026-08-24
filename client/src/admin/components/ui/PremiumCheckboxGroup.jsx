/**
 * Premium styled multi-select checkbox group — for picking multiple items
 * (e.g. Subjects picker on Create Test). Card container with polished rows.
 */
export default function PremiumCheckboxGroup({
  legend,
  options,
  selectedValues,
  onChange,
  disabled = false,
  className = '',
  emptyMessage = 'No options available.',
}) {
  function handleToggle(value) {
    if (disabled) return;
    const numVal = typeof value === 'number' ? value : value;
    const isSelected = selectedValues.includes(numVal);
    const next = isSelected
      ? selectedValues.filter((v) => v !== numVal)
      : [...selectedValues, numVal];
    onChange(next);
  }

  return (
    <fieldset className={`premium-checkbox-group ${className}`.trim()}>
      {legend ? <legend className="premium-checkbox-group__legend">{legend}</legend> : null}
      {options.length === 0 ? (
        <p className="premium-checkbox-group__empty">{emptyMessage}</p>
      ) : (
        <div className="premium-checkbox-group__options">
          {options.map((option) => {
            const isChecked = selectedValues.includes(option.value);
            return (
              <label
                key={option.value}
                className={`premium-checkbox${isChecked ? ' premium-checkbox--checked' : ''}${disabled || option.disabled ? ' premium-checkbox--disabled' : ''}`}
              >
                <input
                  className="premium-checkbox__input"
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => handleToggle(option.value)}
                  disabled={disabled || option.disabled}
                />
                <span className="premium-checkbox__indicator" aria-hidden="true">
                  <svg className="premium-checkbox__check" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="premium-checkbox__body">
                  <span className="premium-checkbox__label">{option.label}</span>
                  {option.hint ? <span className="premium-checkbox__hint">{option.hint}</span> : null}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
