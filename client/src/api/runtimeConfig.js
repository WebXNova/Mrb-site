function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

export function getApiBaseUrl() {
  const fromEnv = stripTrailingSlash(import.meta.env.VITE_API_BASE_URL || '');
  if (fromEnv) return fromEnv;
  return '/api';
}

export function getRequestTimeoutMs() {
  const raw = Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000);
  if (!Number.isFinite(raw) || raw <= 0) return 15000;
  return raw;
}

export function isAuthDebugEnabled() {
  return String(import.meta.env.VITE_AUTH_DEBUG || '').toLowerCase() === 'true';
}

