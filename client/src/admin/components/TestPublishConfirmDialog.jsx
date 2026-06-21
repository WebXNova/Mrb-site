import AdminConfirmDialog from './AdminConfirmDialog';

/**
 * Confirmation gate before publish — no silent publish.
 */
export default function TestPublishConfirmDialog({ open, publishing = false, onConfirm, onCancel }) {
  return (
    <AdminConfirmDialog
      open={open}
      title="Publish Test?"
      message="You will not be able to edit questions after publishing."
      confirmLabel="Publish"
      cancelLabel="Cancel"
      busy={publishing}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
