import { isAuthDebugEnabled } from '../api/runtimeConfig';

function redact(details = {}) {
  const out = { ...details };
  delete out.token;
  delete out.accessToken;
  delete out.refreshToken;
  delete out.authorization;
  if (typeof out.path === 'string') {
    out.path = out.path.split('?')[0];
  }
  for (const [key, value] of Object.entries(out)) {
    if (typeof value === 'string') {
      out[key] = value.replace(/\b[a-f0-9]{64}\b/gi, '[REDACTED]');
    }
  }
  return out;
}

export function logAuthEvent(event, details = {}) {
  if (!isAuthDebugEnabled()) return;
  const safeDetails = redact(details);
  // eslint-disable-next-line no-console
  console.info(`[auth] ${event}`, safeDetails);
}

