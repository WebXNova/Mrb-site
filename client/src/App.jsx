import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { adminApi } from './api/adminApi';
import { bootstrapAdminSession, bootstrapStudentSession } from './api/authRefresh';
import { studentApi } from './api/studentApi';
import { getAdminToken, getStoredUser, getStudentToken, onAuthChanged, setStudentAuth } from './auth/session';
import AppRouter from './routes/AppRouter';

function shouldBootstrapStudent(path) {
  return (
    path.startsWith('/dashboard') ||
    path.startsWith('/student') ||
    /^\/tests\/[^/]+\/(start|result)$/.test(path) ||
    Boolean(getStoredUser('student_user'))
  );
}

function shouldBootstrapAdmin(path) {
  return (path.startsWith('/admin') && !path.startsWith('/admin/login')) || Boolean(getStoredUser('admin_user'));
}

/** Serializes validateAuthState so onAuthChanged cannot run parallel /me races. */
let validateAuthChain = Promise.resolve();

export default function App() {
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function enqueueValidateAuthState() {
      validateAuthChain = validateAuthChain.then(async () => {
        if (cancelled) return;

        const path = typeof window !== 'undefined' ? window.location.pathname : '';

        if (shouldBootstrapAdmin(path) && !getAdminToken()) {
          await bootstrapAdminSession();
        }
        if (shouldBootstrapStudent(path) && !getStudentToken()) {
          await bootstrapStudentSession();
        }

        const checks = [];
        if (getAdminToken()) {
          checks.push(adminApi.me().catch(() => {}));
        }
        if (getStudentToken()) {
          checks.push(
            studentApi
              .me()
              .then((me) => {
                if (me?.data) {
                  const prev = getStoredUser('student_user') || {};
                  const token = getStudentToken();
                  setStudentAuth(token, { ...prev, ...me.data });
                }
              })
              .catch(() => {})
          );
        }
        await Promise.all(checks);
        if (!cancelled) setIsAuthReady(true);
      });
    }

    enqueueValidateAuthState();
    const unsubscribe = onAuthChanged(() => {
      enqueueValidateAuthState();
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
