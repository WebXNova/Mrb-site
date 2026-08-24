/**
 * Premium section card — consistent container with title, optional lead text,
 * matching the test-settings-section pattern.
 */
export default function SectionCard({
  title,
  titleId,
  lead,
  children,
  className = '',
}) {
  const id = titleId || (title ? `section-${title.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  return (
    <section
      className={`premium-section-card ${className}`.trim()}
      aria-labelledby={id}
    >
      {title ? (
        <h2 id={id} className="premium-section-card__title">{title}</h2>
      ) : null}
      {lead ? (
        <p className="premium-section-card__lead">{lead}</p>
      ) : null}
      <div className="premium-section-card__body">
        {children}
      </div>
    </section>
  );
}
