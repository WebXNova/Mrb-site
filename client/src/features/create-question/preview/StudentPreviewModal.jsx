import { useEffect, useRef } from 'react';
import StudentPreviewPanel from './StudentPreviewPanel.jsx';

/**
 * Modal student preview — live updates while open; not shown inline in the workspace.
 */
export default function StudentPreviewModal({ open, onClose, previewModel }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sp-modal" role="presentation">
      <button
        type="button"
        className="sp-modal__backdrop"
        onClick={onClose}
        aria-label="Close student view"
      />
      <div
        className="sp-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sp-modal-title"
      >
        <header className="sp-modal__toolbar">
          <h2 id="sp-modal-title" className="sp-modal__toolbar-title">
            Student view
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <div className="sp-modal__body">
          <StudentPreviewPanel model={previewModel} showHeader={false} />
        </div>
      </div>
    </div>
  );
}
