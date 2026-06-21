export default function PremiumFormField({
  id,
  label,
  required = false,
  hint,
  counter,
  counterWarn = false,
  error,
  children,
  className = '',
}) {
  return (
    <div className={`premium-field${error ? ' premium-field--error' : ''} ${className}`.trim()}>
      <div className="premium-field__label-row">
        <label className="premium-field__label" htmlFor={id}>
          {label}
          {required ? <span className="premium-field__required" aria-hidden>*</span> : null}
        </label>
        {counter != null ? (
          <span className={`premium-field__counter${counterWarn ? ' premium-field__counter--warn' : ''}`}>
            {counter}
          </span>
        ) : null}
      </div>
      {children}
      {hint && !error ? <p className="premium-field__hint">{hint}</p> : null}
      {error ? (
        <p className="premium-field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
