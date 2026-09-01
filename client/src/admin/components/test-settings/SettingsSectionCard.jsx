/**
 * Settings section card — icon, short title, one-line description, then controls.
 */
export default function SettingsSectionCard({
  id,
  titleId,
  icon,
  title,
  description,
  children,
  className = '',
}) {
  return (
    <section id={id} className={`ts-card ${className}`.trim()} aria-labelledby={titleId}>
      <header className="ts-card__head">
        {icon ? <div className="ts-card__icon">{icon}</div> : null}
        <div className="ts-card__heading">
          <h2 id={titleId} className="ts-card__title">
            {title}
          </h2>
          {description ? <p className="ts-card__desc">{description}</p> : null}
        </div>
      </header>
      <div className="ts-card__body">{children}</div>
    </section>
  );
}

export function SettingsSubsection({ title, children, id }) {
  return (
    <div className="ts-sub" id={id}>
      {title ? <h3 className="ts-sub__title">{title}</h3> : null}
      {children}
    </div>
  );
}
