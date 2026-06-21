/**
 * Cross-tab refresh coordination: one leader tab rotates HttpOnly cookies;
 * followers wait via BroadcastChannel with a localStorage lock fallback.
 */

const BC_CHANNEL = 'mrb-auth-refresh-v1';
const LS_LOCK_PREFIX = 'mrb_refresh_coord_';
const LOCK_TTL_MS = 30_000;
const LOCK_STALE_MS = 35_000;
const WAIT_POLL_MS = 50;
const WAIT_TIMEOUT_MS = 30_000;

const TAB_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** @type {BroadcastChannel | null} */
let broadcastChannel = null;

/** @type {Map<string, Set<(payload: object) => void>>} */
const scopeListeners = new Map();

function lockStorageKey(scope) {
  return `${LS_LOCK_PREFIX}${scope}`;
}

function readLock(scope) {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(lockStorageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLock(scope, payload) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!payload) localStorage.removeItem(lockStorageKey(scope));
    else localStorage.setItem(lockStorageKey(scope), JSON.stringify(payload));
  } catch {
    // quota / privacy mode
  }
}

function isLockHeldByOther(scope) {
  const lock = readLock(scope);
  if (!lock || lock.tabId === TAB_ID) return false;
  if (lock.status !== 'in-flight') return false;
  const age = Date.now() - Number(lock.ts || 0);
  return age >= 0 && age < LOCK_STALE_MS;
}

function notifyScopeListeners(scope, payload) {
  const listeners = scopeListeners.get(scope);
  if (!listeners) return;
  for (const listener of listeners) {
    try {
      listener(payload);
    } catch {
      // ignore listener failures
    }
  }
}

function handleCoordinatorMessage(payload) {
  if (!payload || typeof payload !== 'object' || !payload.scope) return;
  if (payload.tabId === TAB_ID) return;
  notifyScopeListeners(payload.scope, payload);
}

function initBroadcastChannel() {
  if (broadcastChannel || typeof BroadcastChannel === 'undefined') return broadcastChannel;
  try {
    broadcastChannel = new BroadcastChannel(BC_CHANNEL);
    broadcastChannel.onmessage = (event) => handleCoordinatorMessage(event.data);
  } catch {
    broadcastChannel = null;
  }
  return broadcastChannel;
}

function postCoordinatorMessage(message) {
  initBroadcastChannel();
  try {
    broadcastChannel?.postMessage(message);
  } catch {
    // ignore
  }
}

function subscribeScope(scope, listener) {
  if (!scopeListeners.has(scope)) scopeListeners.set(scope, new Set());
  scopeListeners.get(scope).add(listener);
  return () => {
    scopeListeners.get(scope)?.delete(listener);
  };
}

function tryAcquireCrossTabLock(scope) {
  if (isLockHeldByOther(scope)) return false;
  const next = { tabId: TAB_ID, scope, status: 'in-flight', ts: Date.now() };
  writeLock(scope, next);
  const confirmed = readLock(scope);
  return confirmed?.tabId === TAB_ID && confirmed?.status === 'in-flight';
}

function waitForCrossTabRefresh(scope) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let settled = false;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(payload);
    };

    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const onMessage = (payload) => {
      if (payload.type === 'refresh-complete' || payload.type === 'refresh-failed') {
        finish(payload);
      }
    };

    const onStorage = (event) => {
      if (event.key !== lockStorageKey(scope)) return;
      if (!event.newValue) {
        finish({ type: 'refresh-complete', scope, ok: true, via: 'storage-unlock' });
        return;
      }
      try {
        const lock = JSON.parse(event.newValue);
        if (lock?.status === 'complete' || lock?.status === 'failed') {
          finish({
            type: lock.status === 'complete' ? 'refresh-complete' : 'refresh-failed',
            scope,
            ok: lock.status === 'complete',
            user: lock.user ?? null,
            revoked: Boolean(lock.revoked),
            via: 'storage',
          });
        }
      } catch {
        // ignore malformed lock payloads
      }
    };

    const poll = () => {
      if (settled) return;
      if (Date.now() - startedAt > WAIT_TIMEOUT_MS) {
        fail(new Error('Cross-tab refresh wait timed out'));
        return;
      }
      const lock = readLock(scope);
      if (!lock || lock.tabId === TAB_ID) {
        setTimeout(poll, WAIT_POLL_MS);
        return;
      }
      if (lock.status === 'complete') {
        finish({
          type: 'refresh-complete',
          scope,
          ok: true,
          user: lock.user ?? null,
          via: 'poll',
        });
        return;
      }
      if (lock.status === 'failed') {
        finish({
          type: 'refresh-failed',
          scope,
          ok: false,
          revoked: Boolean(lock.revoked),
          via: 'poll',
        });
        return;
      }
      if (!isLockHeldByOther(scope)) {
        finish({ type: 'refresh-complete', scope, ok: true, via: 'poll-stale-lock' });
        return;
      }
      setTimeout(poll, WAIT_POLL_MS);
    };

    const cleanup = () => {
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage);
      }
    };

    const unsubscribe = subscribeScope(scope, onMessage);
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
    }
    poll();
  });
}

/**
 * @returns {Promise<{ role: 'leader' } | { role: 'follower', wait: Promise<object> }>}
 */
export async function acquireCrossTabRefreshLease(scope) {
  initBroadcastChannel();
  if (tryAcquireCrossTabLock(scope)) {
    postCoordinatorMessage({ type: 'refresh-started', scope, tabId: TAB_ID, ts: Date.now() });
    return { role: 'leader' };
  }
  return { role: 'follower', wait: waitForCrossTabRefresh(scope) };
}

export function broadcastRefreshComplete(scope, { user = null } = {}) {
  writeLock(scope, { tabId: TAB_ID, scope, status: 'complete', ts: Date.now(), user });
  postCoordinatorMessage({
    type: 'refresh-complete',
    scope,
    tabId: TAB_ID,
    ok: true,
    user,
    ts: Date.now(),
  });
  setTimeout(() => {
    const lock = readLock(scope);
    if (lock?.tabId === TAB_ID && lock?.status === 'complete') {
      writeLock(scope, null);
    }
  }, LOCK_TTL_MS);
}

export function broadcastRefreshFailed(scope, { revoked = false } = {}) {
  writeLock(scope, { tabId: TAB_ID, scope, status: 'failed', ts: Date.now(), revoked });
  postCoordinatorMessage({
    type: 'refresh-failed',
    scope,
    tabId: TAB_ID,
    ok: false,
    revoked,
    ts: Date.now(),
  });
  setTimeout(() => {
    const lock = readLock(scope);
    if (lock?.tabId === TAB_ID && lock?.status === 'failed') {
      writeLock(scope, null);
    }
  }, LOCK_TTL_MS);
}

/** Notify other tabs that a role signed out (does not clear cookies — localStorage sync handles that). */
export function broadcastLogout(scope) {
  postCoordinatorMessage({
    type: 'logout-complete',
    scope,
    tabId: TAB_ID,
    ts: Date.now(),
  });
}

export function releaseCrossTabRefreshLease(scope) {
  const lock = readLock(scope);
  if (lock?.tabId === TAB_ID && lock?.status === 'in-flight') {
    writeLock(scope, null);
  }
}

/** Subscribe to refresh coordination events from other tabs (not this tab's own posts). */
export function subscribeCrossTabRefresh(listener) {
  initBroadcastChannel();
  const scopes = ['admin', 'student', 'teacher'];
  const unsubs = scopes.map((scope) => subscribeScope(scope, listener));
  return () => {
    for (const unsub of unsubs) unsub();
  };
}
