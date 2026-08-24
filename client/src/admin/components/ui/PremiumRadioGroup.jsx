/**
 * Premium styled radio group — matches TestSettings option-group pattern.
 * Renders a fieldset with legend, wrapped radio options in a card container.
 */
export default function PremiumRadioGroup({
  legend,
  name,
  value,
  options,
  onChange,
  disabled = false,
  className = '',
}) {
  return (
    <fieldset className={`premium-radio-group ${className}`.trim()}>
      {legend ? <legend className="premium-radio-group__legend">{legend}</legend> : null}
      <div className="premium-radio-group__options">
        {options.map((option) => (
          <label
            key={option.value}
            className={`premium-radio${String(value) === String(option.value) ? ' premium-radio--selected' : ''}${disabled || option.disabled ? ' premium-radio--disabled' : ''}`}
          >
            <input
              className="premium-radio__input"
              type="radio"
              name={name}
              value={option.value}
              checked={String(value) === String(option.value)}
              onChange={() => onChange(option.value)}
              disabled={disabled || option.disabled}
            />
            <span className="premium-radio__indicator" aria-hidden="true">
              <span className="premium-radio__dot" />
            </span>
            <span className="premium-radio__body">
              <span className="premium-radio__label">{option.label}</span>
              {option.hint ? <span className="premium-radio__hint">{option.hint}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
