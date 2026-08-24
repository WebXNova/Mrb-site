/**
 * Premium styled checkbox — consistent with TestSettings polished pattern.
 * Renders a card-style row with properly sized/aligned checkbox + label + optional hint.
 */
export default function PremiumCheckbox({
  id,
  name,
  checked,
  onChange,
  label,
  hint,
  disabled = false,
  className = '',
}) {
  return (
    <label
      className={`premium-checkbox${checked ? ' premium-checkbox--checked' : ''}${disabled ? ' premium-checkbox--disabled' : ''} ${className}`.trim()}
      htmlFor={id}
    >
      <input
        id={id}
        className="premium-checkbox__input"
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="premium-checkbox__indicator" aria-hidden="true">
        <svg className="premium-checkbox__check" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="premium-checkbox__body">
        <span className="premium-checkbox__label">{label}</span>
        {hint ? <span className="premium-checkbox__hint">{hint}</span> : null}
      </span>
    </label>
  );
}
