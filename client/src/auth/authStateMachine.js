const AUTH_STATE_EVENT = 'mrb-auth-state';

let snapshot = {
  status: 'resolving',
  reason: null,
  updatedAt: Date.now(),
};

function emit() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_STATE_EVENT, { detail: snapshot }));
}

function transition(nextStatus, reason = null) {
  snapshot = {
    status: nextStatus,
    reason,
    updatedAt: Date.now(),
  };
  emit();
}

export function getAuthSnapshot() {
  return snapshot;
}

export function setAuthResolving(reason = null) {
  transition('resolving', reason);
}

export function setAuthAuthenticated() {
  transition('authenticated', null);
}

export function setAuthGuest(reason = null) {
  transition('guest', reason);
}

export function setAuthDegraded(reason = null) {
  transition('degraded', reason);
}

export function subscribeAuthState(handler) {
  if (typeof window === 'undefined') return () => {};
  const onEvent = (event) => handler(event.detail || getAuthSnapshot());
  window.addEventListener(AUTH_STATE_EVENT, onEvent);
  return () => window.removeEventListener(AUTH_STATE_EVENT, onEvent);
}

