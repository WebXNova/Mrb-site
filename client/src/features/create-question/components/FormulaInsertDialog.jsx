import { useEffect, useId, useRef, useState } from 'react';

/**
 * Formula insert dialog — plain-text LaTeX input only; no HTML editor.
 */
export default function FormulaInsertDialog({ open, onClose, onSubmit }) {
  const titleId = useId();
  const inputRef = useRef(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setValue('');
    setError('');
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  function handleSubmit(event) {
    event.preventDefault();
    const result = onSubmit(value);
    if (result?.ok === false) {
      setError(result.message || 'Invalid formula.');
      return;
    }
    setValue('');
    setError('');
  }

  return (
    <div className="qaw-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="qaw-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="heading-4">
          Insert formula
        </h2>
        <p className="admin-field__hint">
          Enter LaTeX or math notation. It will appear inline in the question.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="admin-field">
            <label htmlFor="qaw-formula-input">Formula</label>
            <input
              ref={inputRef}
              id="qaw-formula-input"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. E=mc^2"
              autoComplete="off"
              aria-invalid={Boolean(error)}
            />
            {error ? (
              <div className="admin-field__error" role="alert">
                {error}
              </div>
            ) : null}
          </div>
          <div className="qaw-dialog__actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary btn--sm">
              Insert
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
