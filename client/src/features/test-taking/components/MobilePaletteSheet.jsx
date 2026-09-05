export default function MobilePaletteSheet({
  isOpen,
  onClose,
  title = 'Questions',
  ariaLabel = 'Question navigator',
  children,
}) {
  if (!isOpen) return null;

  return (
    <div className="tt-palette-sheet" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <button
        type="button"
        className="tt-palette-sheet__backdrop"
        onClick={onClose}
        aria-label={`Close ${title.toLowerCase()}`}
      />
      <div className="tt-palette-sheet__panel">
        <div className="tt-palette-sheet__header">
          <h2 className="tt-palette-sheet__title">{title}</h2>
          <button type="button" className="tt-palette-sheet__close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="tt-palette-sheet__body">{children}</div>
      </div>
    </div>
  );
}
