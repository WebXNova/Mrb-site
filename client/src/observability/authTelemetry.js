import { isAuthDebugEnabled } from '../api/runtimeConfig';

function redact(details = {}) {
  const out = { ...details };
  delete out.token;
  delete out.accessToken;
  delete out.refreshToken;
  delete out.authorization;
  return out;
}

export function logAuthEvent(event, details = {}) {
  if (!isAuthDebugEnabled()) return;
  const safeDetails = redact(details);
  // eslint-disable-next-line no-console
  console.info(`[auth] ${event}`, safeDetails);
}

