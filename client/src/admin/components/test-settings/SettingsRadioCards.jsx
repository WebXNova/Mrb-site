/**
 * Selectable option cards for radio groups (layout, access mode, etc.).
 */
export default function SettingsRadioCards({
  legend,
  name,
  value,
  onChange,
  disabled = false,
  options = [],
  columns = 2,
  ariaLabel,
  children,
}) {
  return (
    <fieldset
      className={`ts-radio-cards ts-radio-cards--cols-${columns}`}
      aria-label={legend ? undefined : ariaLabel || undefined}
    >
      {legend ? <legend className="ts-radio-cards__legend">{legend}</legend> : null}
      <div className="ts-radio-cards__grid">
        {options.map((option) => {
          const selected = String(value) === String(option.value);
          return (
            <label
              key={option.value}
              className={`ts-radio-card${selected ? ' ts-radio-card--selected' : ''}${
                disabled ? ' ts-radio-card--disabled' : ''
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                disabled={disabled}
              />
              <span className="ts-radio-card__mark" aria-hidden="true" />
              <span className="ts-radio-card__copy">
                <span className="ts-radio-card__title">{option.title}</span>
                {option.description ? (
                  <span className="ts-radio-card__desc">{option.description}</span>
                ) : null}
              </span>
            </label>
          );
        })}
        {children}
      </div>
    </fieldset>
  );
}
