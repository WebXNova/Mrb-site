import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { adminApi } from './api/adminApi';
import { studentApi } from './api/studentApi';
import { clearAdminAuth, clearStudentAuth, getAdminToken, getStoredUser, getStudentToken, onAuthChanged } from './auth/session';
import AppRouter from './routes/AppRouter';

export default function App() {
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function validateAuthState() {
      const checks = [];
      const studentToken = getStudentToken();
      const adminToken = getAdminToken();
      getStoredUser('student_user');
      getStoredUser('admin_user');

      if (studentToken) {
        checks.push(studentApi.me(studentToken).catch(() => clearStudentAuth()));
      }
      if (adminToken) {
        checks.push(adminApi.me(adminToken).catch(() => clearAdminAuth()));
      }

      await Promise.all(checks);
      if (!cancelled) setIsAuthReady(true);
    }

    validateAuthState();
    const unsubscribe = onAuthChanged(() => {
      validateAuthState();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (!isAuthReady) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        Verifying session...
      </div>
    );
  }

  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <AppRouter />
    </BrowserRouter>
  );
}
