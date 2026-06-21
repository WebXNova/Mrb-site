export default function AdminConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="admin-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-confirm-title">
      <div className="admin-confirm-dialog__panel">
        <h2 id="admin-confirm-title" className="admin-confirm-dialog__title">
          {title}
        </h2>
        {typeof message === 'string' ? (
          <p className="admin-confirm-dialog__body">{message}</p>
        ) : (
          <div className="admin-confirm-dialog__body">{message}</div>
        )}
        <div className="admin-confirm-dialog__actions">
          <button type="button" className="btn--course-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'btn--course-danger' : 'btn--course-primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
