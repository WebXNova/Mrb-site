/**
 * Compact segmented control for two-or-more exclusive options.
 */
export default function SettingsSegmentedControl({
  legend,
  name,
  value,
  onChange,
  disabled = false,
  options = [],
  ariaLabel,
}) {
  return (
    <fieldset className="ts-segmented">
      {legend ? <legend className="ts-segmented__legend">{legend}</legend> : null}
      <div className="ts-segmented__list" role="radiogroup" aria-label={legend || ariaLabel || undefined}>
        {options.map((option) => {
          const selected = String(value) === String(option.value);
          return (
            <label
              key={option.value}
              className={`ts-segmented__item${selected ? ' ts-segmented__item--selected' : ''}${
                disabled ? ' ts-segmented__item--disabled' : ''
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
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
