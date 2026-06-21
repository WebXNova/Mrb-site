/**
 * Premium "H" monogram — opens the student navigation drawer.
 */
export default function StudentPortalMonogram({ onClick, expanded = false, className = '' }) {
  return (
    <button
      type="button"
      className={`sp-monogram ${className}`.trim()}
      aria-label={expanded ? 'Close navigation menu' : 'Open navigation menu'}
      aria-expanded={expanded}
      aria-controls="student-sidebar-nav"
      onClick={onClick}
    >
      <span className="sp-monogram__mark" aria-hidden>
        H
      </span>
    </button>
  );
}
