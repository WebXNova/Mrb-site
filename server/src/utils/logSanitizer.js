const SENSITIVE_KEYS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'authorization',
  'api_key',
  'apikey',
  'api-key',
  'sendgrid_api_key',
  'x-email-webhook-signature',
  'x-email-webhook-secret',
  'x-api-key',
  'x-auth-token',
  'otp',
  'otp_code',
  'verification_code',
  'password',
  'passwd',
  'secret',
  'client_secret',
  'private_key',
  'passphrase',
  'credential',
  'credentials',
  'cookie',
  'set-cookie',
  'csrf',
  'csrf_token',
  'session_token',
  'auth_token',
  'bearer',
  'turnstile',
  'captcha_response',
  'captcha_token',
  'webhook_secret',
  'signature',
  'jwt',
]);

const SENSITIVE_VALUE_PATTERN =
  /\b(eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+|[a-f0-9]{64}|bearer\s+[a-z0-9\-_\.]+|basic\s+[a-z0-9+/=]+)\b/gi;

const OTP_VALUE_PATTERN = /^\d{4,8}$/;

function isSensitiveKey(key) {
  const normalized = String(key).toLowerCase();
  if (SENSITIVE_KEYS.has(normalized)) return true;
  if (normalized.includes('password')) return true;
  if (normalized.includes('secret')) return true;
  if (normalized.includes('token') && normalized !== 'error_token') return true;
  return false;
}

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
    if (isSensitiveKey(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    if (String(key).toLowerCase() === 'code' && typeof value === 'string' && OTP_VALUE_PATTERN.test(value)) {
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
    if (isSensitiveKey(key)) {
      params.set(key, '[REDACTED]');
    }
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

