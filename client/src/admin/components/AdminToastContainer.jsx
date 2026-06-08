import { useAdminToast } from '../context/AdminToastContext';

export default function AdminToastContainer() {
  const { toasts, dismiss } = useAdminToast();

  if (!toasts.length) return null;

  return (
    <div className="admin-toast-stack" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`admin-toast admin-toast--${toast.type}`}
          role="status"
        >
          <span className="admin-toast__icon" aria-hidden>
            {toast.type === 'success' ? '✓' : toast.type === 'error' ? '⚠' : 'ℹ'}
          </span>
          <p className="admin-toast__message">{toast.message}</p>
          <button
            type="button"
            className="admin-toast__close"
            aria-label="Dismiss notification"
            onClick={() => dismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
