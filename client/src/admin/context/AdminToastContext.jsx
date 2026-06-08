import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const AdminToastContext = createContext(null);

let toastId = 0;

/**
 * @typedef {{ id: number, type: 'success' | 'error' | 'info', message: string }} ToastItem
 */

export function AdminToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (message, type = 'info', durationMs = 4000) => {
      const id = ++toastId;
      setToasts((prev) => [...prev, { id, type, message }]);
      const timer = setTimeout(() => dismiss(id), durationMs);
      timersRef.current.set(id, timer);
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toasts,
      showToast,
      dismiss,
      success: (message) => showToast(message, 'success'),
      error: (message) => showToast(message, 'error'),
      info: (message) => showToast(message, 'info'),
    }),
    [toasts, showToast, dismiss]
  );

  return <AdminToastContext.Provider value={value}>{children}</AdminToastContext.Provider>;
}

export function useAdminToast() {
  const ctx = useContext(AdminToastContext);
  if (!ctx) {
    throw new Error('useAdminToast must be used within AdminToastProvider');
  }
  return ctx;
}
