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
  setAdminAuth,
  setStudentAuth,
} from './auth/session';
import { studentApi } from './api/studentApi';
import { adminApi } from './api/adminApi';
import { getApiBaseUrl, getRequestTimeoutMs } from './api/runtimeConfig';
import MobileWhatsAppButton from './components/ui/MobileWhatsAppButton';
import AppRouter from './routes/AppRouter';
import { authBootMark, authBootSpan, authBootSummary } from './observability/authBootProfile';

/**
 * Mint `csrf_token` at CSRF_COOKIE_PATH (/) so `document.cookie` can read it before refresh/logout POSTs.
 * Bounded timeout so a down API cannot block the SPA shell forever (stuck "Verifying session...").
 */
async function ensureSpaReadableCsrfCookie() {
  return authBootSpan('ensureSpaReadableCsrfCookie', async () => {
    const timeoutMs = Math.min(getRequestTimeoutMs(), 10_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await fetch(`${getApiBaseUrl()}/auth/csrf-session`, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
      });
    } catch {
      /* offline, CORS, 403 origin, or abort — continue; login may have set CSRF already */
    } finally {
      clearTimeout(timer);
    }
  });
}

function syncAuthStateFromTokens() {
  if (getAdminToken() || getStudentToken()) setAuthAuthenticated();
  else setAuthGuest('no-active-session');
}

/**
 * Validate the existing HttpOnly session on app boot WITHOUT rotating
 * the refresh token.
 *
 * Calls /auth/student/me and /auth/me (read-only endpoints that only
 * validate the access cookie). When the access cookie is still valid
 * the response returns the user immediately and no refresh-token
 * rotation occurs. If the access cookie is expired but the refresh
 * cookie is still valid, the existing 401 -> single-flight refresh
 * interceptor in `requestClient` performs ONE rotation and retries
 * `me` automatically. If the session is truly revoked / the refresh
 * also returns 401, the local user record is cleared and the UI
 * redirects to login.
 *
 * Why this matters: a previous attempt called `refreshAccessToken`
 * on every boot, which combined with the server's strict refresh
 * replay detection (authSession.service.js: `confirmedReplay`)
 * caused multi-tab opens / fast reloads to revoke the entire session
 * because two tabs raced the same refresh token. Using `me` keeps
 * boot validation idempotent and only rotates when actually needed.
 */
async function rehydrateSessionFromCookies() {
  if (getStoredUser('student_user')?.id) {
    await authBootSpan('rehydrate.studentMe', async () => {
      try {
        const me = await studentApi.me();
        if (me?.data?.id) setStudentAuth('__cookie_session__', me.data);
        else clearStudentAuth();
      } catch (e) {
        if (e?.status === 401) clearStudentAuth();
      }
    });
  }
  if (getStoredUser('admin_user')?.id) {
    await authBootSpan('rehydrate.adminMe', async () => {
      try {
        const me = await adminApi.me();
        if (me?.data?.id) setAdminAuth('__cookie_session__', me.data);
        else clearAdminAuth();
      } catch (e) {
        if (e?.status === 401) clearAdminAuth();
      }
    });
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
      authBootMark('boot.start');
      try {
        await ensureSpaReadableCsrfCookie();
        await rehydrateSessionFromCookies();
      } catch {
        /* network or unexpected API errors — still mount the app */
      } finally {
        if (!cancelled) {
          syncAuthStateFromTokens();
          setAuthStatus(getAuthSnapshot().status);
          setIsAuthReady(true);
          authBootMark('boot.ready');
          authBootSummary();
        }
      }
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
