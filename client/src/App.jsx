import { useEffect, useState } from 'react';

import { BrowserRouter } from 'react-router-dom';

import {
  getAuthSnapshot,
  setAuthAuthenticated,
  setAuthGuest,
  subscribeAuthState,
} from './auth/authStateMachine';
import {
  clearAdminAuth,
  clearStudentAuth,
  getAdminToken,
  getStoredUser,
  getStudentToken,
  onAuthChanged,
} from './auth/session';
import { isRefreshAuthRevokedError, refreshAccessToken } from './api/requestClient';
import MobileWhatsAppButton from './components/ui/MobileWhatsAppButton';
import AppRouter from './routes/AppRouter';

function syncAuthStateFromTokens() {
  if (getAdminToken() || getStudentToken()) setAuthAuthenticated();
  else setAuthGuest('no-active-session');
}

/** After full page reload, access tokens are empty but httpOnly refresh cookies may still exist. */
async function rehydrateSessionFromCookies() {
  if (!getStudentToken() && getStoredUser('student_user')?.id) {
    try {
      await refreshAccessToken('student');
    } catch (e) {
      if (isRefreshAuthRevokedError(e)) clearStudentAuth();
    }
  }
  if (!getAdminToken() && getStoredUser('admin_user')?.id) {
    try {
      await refreshAccessToken('admin');
    } catch (e) {
      if (isRefreshAuthRevokedError(e)) clearAdminAuth();
    }
  }
}

export default function App() {
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authStatus, setAuthStatus] = useState(getAuthSnapshot().status);

  useEffect(() => {
    // Subscribe before emitting transitions — RequireStudent must not stay on "resolving"
    const unsubscribeAuthState = subscribeAuthState((next) => setAuthStatus(next.status));
    const unsubscribe = onAuthChanged(() => {
      syncAuthStateFromTokens();
    });

    let cancelled = false;

    (async () => {
      await rehydrateSessionFromCookies();
      if (cancelled) return;
      syncAuthStateFromTokens();
      setAuthStatus(getAuthSnapshot().status);
      setIsAuthReady(true);
    })();

    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeAuthState();
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
      <AppRouter authStatus={authStatus} />
      <MobileWhatsAppButton />
    </BrowserRouter>
  );
}
