export default function MobilePaletteSheet({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  return (
    <div className="tt-palette-sheet" role="dialog" aria-modal="true" aria-label="Question palette">
      <button
        type="button"
        className="tt-palette-sheet__backdrop"
        onClick={onClose}
        aria-label="Close question palette"
      />
      <div className="tt-palette-sheet__panel">
        <div className="tt-palette-sheet__header">
          <h2 className="tt-palette-sheet__title">Questions</h2>
          <button type="button" className="tt-palette-sheet__close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="tt-palette-sheet__body">{children}</div>
      </div>
    </div>
  );
}
