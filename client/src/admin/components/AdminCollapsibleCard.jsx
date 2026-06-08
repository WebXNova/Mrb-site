import { useId } from 'react';

export default function AdminCollapsibleCard({
  title,
  storageKey,
  expanded,
  onToggle,
  children,
  className = 'admin-card',
}) {
  const contentId = useId();

  return (
    <section className={className}>
      <button
        type="button"
        className="admin-collapsible__trigger"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={onToggle}
      >
        <span className="admin-collapsible__icon" aria-hidden>
          {expanded ? '▼' : '▶'}
        </span>
        <span className="heading-3 admin-collapsible__title">{title}</span>
      </button>
      <div id={contentId} className="admin-collapsible__body" hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}
