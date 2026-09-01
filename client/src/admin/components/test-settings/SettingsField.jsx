export function SettingsField({ id, label, hint, error, children, className = '' }) {
  return (
    <div className={`ts-field ${className}`.trim()}>
      {label ? (
        <label className="ts-field__label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <div className="ts-field__error" role="alert">
          {error}
        </div>
      ) : null}
      {hint ? <p className="ts-field__hint">{hint}</p> : null}
    </div>
  );
}

export function SettingsAffixInput({
  id,
  prefix,
  suffix,
  className = '',
  ...inputProps
}) {
  return (
    <div className={`ts-affix ${className}`.trim()}>
      {prefix ? <span className="ts-affix__addon">{prefix}</span> : null}
      <input id={id} className="ts-affix__input" {...inputProps} />
      {suffix ? <span className="ts-affix__addon ts-affix__addon--end">{suffix}</span> : null}
    </div>
  );
}

export function SettingsNotice({ tone = 'info', children, className = '' }) {
  return (
    <div className={`ts-notice ts-notice--${tone} ${className}`.trim()} role="status">
      {children}
    </div>
  );
}

export function SettingsIdentityCard({ title, hint }) {
  return (
    <div className="ts-identity">
      <p className="ts-identity__value">{title}</p>
      {hint ? <p className="ts-identity__hint">{hint}</p> : null}
    </div>
  );
}
