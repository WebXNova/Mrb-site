const REFRESH_STORE_KEY = '__mrb_refresh_single_flight__';

function getGlobalScope() {
  if (typeof window !== 'undefined') return window;
  return globalThis;
}

function getStore() {
  const scope = getGlobalScope();
  if (!scope[REFRESH_STORE_KEY]) {
    scope[REFRESH_STORE_KEY] = Object.create(null);
  }
  return scope[REFRESH_STORE_KEY];
}

/** @param {'admin' | 'student' | 'teacher'} authScope */
export function getRefreshInFlightPromise(authScope) {
  if (!authScope) return null;
  return getStore()[authScope] || null;
}

/** @param {'admin' | 'student' | 'teacher'} authScope */
export function hasRefreshInFlight(authScope) {
  return Boolean(getRefreshInFlightPromise(authScope));
}

/**
 * One in-flight refresh per auth scope so student/admin/teacher boot probes
 * cannot block or short-circuit each other's cookie rotation.
 *
 * @param {'admin' | 'student' | 'teacher'} authScope
 */
export function runSingleFlightRefresh(authScope, startRefresh) {
  const store = getStore();
  if (store[authScope]) {
    return store[authScope];
  }

  store[authScope] = Promise.resolve()
    .then(startRefresh)
    .finally(() => {
      delete store[authScope];
    });

  return store[authScope];
}
