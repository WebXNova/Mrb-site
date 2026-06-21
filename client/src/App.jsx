import { useEffect, useState } from 'react';

import { BrowserRouter } from 'react-router-dom';

import { rehydrateSessionFromCookies } from './auth/authRehydration';
import {
  getAuthSnapshot,
  setAuthResolving,
  subscribeAuthState,
} from './auth/authStateMachine';
import { onAuthChanged, syncGlobalAuthState } from './auth/session';
import { getApiBaseUrl, getRequestTimeoutMs } from './api/runtimeConfig';
import AppShellSkeleton from './components/ui/AppShellSkeleton';
import MobileWhatsAppButton from './components/ui/MobileWhatsAppButton';
import AppRouter from './routes/AppRouter';
import { authBootMark, authBootSpan, authBootSummary } from './observability/authBootProfile';
import { SeoProvider } from './seo/SeoContext.jsx';

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
  syncGlobalAuthState('no-active-session');
}

export default function App() {
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authStatus, setAuthStatus] = useState(getAuthSnapshot().status);

  useEffect(() => {
    const unsubscribeAuthState = subscribeAuthState((next) => setAuthStatus(next.status));
    const unsubscribe = onAuthChanged(() => {
      syncAuthStateFromTokens();
    });

    let cancelled = false;

    (async () => {
      authBootMark('boot.start');
      setAuthResolving('boot');
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
    return <AppShellSkeleton label="Verifying session" />;
  }

  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <SeoProvider>
        <AppRouter authStatus={authStatus} />
      </SeoProvider>
      <MobileWhatsAppButton />
    </BrowserRouter>
  );
}
