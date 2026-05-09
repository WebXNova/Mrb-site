const SENSITIVE_KEYS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'api_key',
  'sendgrid_api_key',
  'x-email-webhook-signature',
  'code',
  'otp',
  'password',
]);

const SENSITIVE_VALUE_PATTERN = /\b([a-f0-9]{64}|bearer\s+[a-z0-9\-_\.]+)\b/gi;

function sanitizeValue(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value.replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]');
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (typeof value === 'object') return sanitizeMetadata(value);
  return value;
}

export function sanitizeMetadata(metadata = {}) {
  const out = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (SENSITIVE_KEYS.has(String(key).toLowerCase())) {
      out[key] = '[REDACTED]';
      continue;
    }
    out[key] = sanitizeValue(value);
  }
  return out;
}

export function sanitizePath(urlOrPath = '') {
  const raw = String(urlOrPath || '');
  const qIndex = raw.indexOf('?');
  if (qIndex === -1) return raw;
  const base = raw.slice(0, qIndex);
  const params = new URLSearchParams(raw.slice(qIndex + 1));
  for (const key of [...params.keys()]) {
    if (SENSITIVE_KEYS.has(String(key).toLowerCase())) {
      params.set(key, '[REDACTED]');
    }
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

