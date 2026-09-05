import { request } from './requestClient.js';

function studentRequest(path, options = {}) {
  return request(path, { ...options, authScope: 'student' });
}

function guestRequest(path, options = {}) {
  return request(path, { ...options, authScope: null, retryOnUnauthorized: false });
}

export const standaloneTestsApi = {
  catalog: () =>
    request('/standalone-tests/catalog', { method: 'GET', authScope: null, retryOnUnauthorized: false }),
  freeCatalog: () =>
    request('/standalone-tests/free-catalog', { method: 'GET', authScope: null, retryOnUnauthorized: false }),
  publicDetail: (slug) =>
    request(`/standalone-tests/public/${encodeURIComponent(slug)}`, {
      method: 'GET',
      authScope: null,
      retryOnUnauthorized: false,
    }),
  myResults: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    if (params.search) query.set('search', params.search);
    if (params.accessType && params.accessType !== 'all') query.set('accessType', params.accessType);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    const qs = query.toString();
    return studentRequest(`/standalone-tests/my-results${qs ? `?${qs}` : ''}`);
  },
  myTests: (params = {}) => standaloneTestsApi.myResults(params),
  myRegistration: (slug) =>
    studentRequest(`/standalone-tests/${encodeURIComponent(slug)}/my-registration`),
  register: (slug, body) =>
    studentRequest(`/standalone-tests/${encodeURIComponent(slug)}/register`, {
      method: 'POST',
      body,
    }),
  checkoutInfo: (orderId) =>
    studentRequest(`/standalone-tests/orders/${encodeURIComponent(orderId)}/checkout-info`),
  status: (orderId) =>
    studentRequest(`/standalone-tests/orders/${encodeURIComponent(orderId)}/status`),
  submitPayment: (orderId, formData) =>
    studentRequest(`/standalone-tests/orders/${encodeURIComponent(orderId)}/submit`, {
      method: 'POST',
      body: formData,
    }),
  prep: (slug) => studentRequest(`/standalone-tests/${encodeURIComponent(slug)}/prep`),
  verifyCode: (slug, payload) =>
    studentRequest(`/standalone-tests/${encodeURIComponent(slug)}/verify-code`, {
      method: 'POST',
      body: payload || {},
    }),
  getStartData: (slug, attemptId) =>
    studentRequest(`/standalone-tests/${encodeURIComponent(slug)}/attempts/${encodeURIComponent(attemptId)}/start`, {
      timeoutMs: 45_000,
      retryOnUnauthorized: false,
    }),
  saveAnswer: (slug, attemptId, payload) =>
    studentRequest(`/standalone-tests/${encodeURIComponent(slug)}/attempts/${encodeURIComponent(attemptId)}/answers`, {
      method: 'PATCH',
      body: payload,
      timeoutMs: 30_000,
      retryOnUnauthorized: false,
    }),
  submitAttempt: (slug, attemptId) =>
    studentRequest(`/standalone-tests/${encodeURIComponent(slug)}/attempts/${encodeURIComponent(attemptId)}/submit`, {
      method: 'POST',
      body: {},
      // ≥ MySQL claim txn window (60s) + grade/persist; under Nginx proxy_read_timeout 95s
      timeoutMs: 75_000,
      retryOnUnauthorized: false,
    }),
  getResult: (slug, attemptId) =>
    studentRequest(`/standalone-tests/${encodeURIComponent(slug)}/attempts/${encodeURIComponent(attemptId)}/result`, {
      timeoutMs: 45_000,
      retryOnUnauthorized: false,
    }),
  reportIntegrityEvent: (slug, attemptId) =>
    studentRequest(
      `/standalone-tests/${encodeURIComponent(slug)}/attempts/${encodeURIComponent(attemptId)}/integrity-events`,
      { method: 'POST', body: {} }
    ),
  freeSessionStatus: (slug) =>
    guestRequest(`/standalone-tests/${encodeURIComponent(slug)}/free-session`, { method: 'GET' }),
  freeSessionStart: (slug, payload) =>
    guestRequest(`/standalone-tests/${encodeURIComponent(slug)}/free-session/start`, {
      method: 'POST',
      body: payload || {},
    }),
  freeSessionEnrollment: (slug, body) =>
    guestRequest(`/standalone-tests/${encodeURIComponent(slug)}/free-session/enrollment`, {
      method: 'POST',
      body,
    }),
  freeSessionClaim: (slug) =>
    studentRequest(`/standalone-tests/${encodeURIComponent(slug)}/free-session/claim`, {
      method: 'POST',
      body: {},
    }),
  freeSessionStartData: (slug, attemptId) =>
    guestRequest(
      `/standalone-tests/${encodeURIComponent(slug)}/free-session/attempts/${encodeURIComponent(attemptId)}/start`,
      { timeoutMs: 45_000 }
    ),
  freeSessionSaveAnswer: (slug, attemptId, payload) =>
    guestRequest(
      `/standalone-tests/${encodeURIComponent(slug)}/free-session/attempts/${encodeURIComponent(attemptId)}/answers`,
      { method: 'PATCH', body: payload, timeoutMs: 30_000 }
    ),
  freeSessionSubmitAttempt: (slug, attemptId) =>
    guestRequest(
      `/standalone-tests/${encodeURIComponent(slug)}/free-session/attempts/${encodeURIComponent(attemptId)}/submit`,
      { method: 'POST', body: {}, timeoutMs: 75_000 }
    ),
  freeSessionIntegrityEvent: (slug, attemptId) =>
    guestRequest(
      `/standalone-tests/${encodeURIComponent(slug)}/free-session/attempts/${encodeURIComponent(attemptId)}/integrity-events`,
      { method: 'POST', body: {} }
    ),
};

const RUNTIME_KIND_KEY = (slug) => `standaloneRuntime:${slug}`;
const PAID_FLAG_KEY = (slug) => `paidStandalone:${slug}`;

export function markStandaloneSession(slug, kind = 'paid_standalone') {
  try {
    sessionStorage.setItem(RUNTIME_KIND_KEY(slug), kind);
    if (kind === 'paid_standalone') {
      sessionStorage.setItem(PAID_FLAG_KEY(slug), '1');
    }
  } catch {
    /* ignore */
  }
}

export function markPaidStandaloneSession(slug) {
  markStandaloneSession(slug, 'paid_standalone');
}

export function isStandaloneRuntimeSession(slug) {
  try {
    const kind = sessionStorage.getItem(RUNTIME_KIND_KEY(slug));
    if (kind === 'free_standalone' || kind === 'paid_standalone') return true;
    if (sessionStorage.getItem(PAID_FLAG_KEY(slug)) === '1') return true;
    const raw = JSON.parse(sessionStorage.getItem(`test_attempt_${slug}`) || '{}');
    return raw.accessKind === 'free_standalone' || raw.accessKind === 'paid_standalone';
  } catch {
    return false;
  }
}

export function isPaidStandaloneSession(slug) {
  return isStandaloneRuntimeSession(slug);
}

export function getStandaloneSessionKind(slug) {
  try {
    return sessionStorage.getItem(RUNTIME_KIND_KEY(slug)) || null;
  } catch {
    return null;
  }
}
