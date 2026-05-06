const REFRESH_STORE_KEY = '__mrb_refresh_single_flight__';

function getGlobalScope() {
  if (typeof window !== 'undefined') return window;
  return globalThis;
}

function getStore() {
  const scope = getGlobalScope();
  if (!scope[REFRESH_STORE_KEY]) {
    scope[REFRESH_STORE_KEY] = { promise: null };
  }
  return scope[REFRESH_STORE_KEY];
}

export function getRefreshInFlightPromise() {
  return getStore().promise;
}

export function hasRefreshInFlight() {
  return Boolean(getStore().promise);
}

export function runSingleFlightRefresh(startRefresh) {
  const store = getStore();
  if (store.promise) {
    return store.promise;
  }

  store.promise = Promise.resolve()
    .then(startRefresh)
    .finally(() => {
      store.promise = null;
    });

  return store.promise;
}
