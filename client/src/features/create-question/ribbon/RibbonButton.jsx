export default function RibbonButton({
  label,
  shortcut,
  pressed,
  disabled = false,
  onClick,
  children,
  title,
}) {
  const tip = title || (shortcut ? `${label} (${shortcut})` : label);

  return (
    <button
      type="button"
      className={`qaw-ribbon-btn${pressed ? ' qaw-ribbon-btn--pressed' : ''}`}
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      title={tip}
      onClick={onClick}
    >
      {children || <span className="qaw-ribbon-btn__label">{label}</span>}
    </button>
  );
}
