import 'dotenv/config';

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Local development only.
 * Railway ignores .env anyway, so this never affects production.
 */
dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
  override: true,
});

/**
 * Safe env reader (NO CRASH ON IMPORT)
 */
function required(name, fallback = null) {
  const value = process.env[name];

  if (value === undefined || value === null || value === '') {
    return fallback; // DO NOT throw during import
  }

  return value;
}

/**
 * Strict JWT validation (kept as-is but safe)
 */
function requiredJwtSecret(name) {
  const value = required(name);

  if (!value) {
    throw new Error(`Missing required env variable: ${name}`);
  }

  const lowered = String(value).toLowerCase();

  if (String(value).length < 32) {
    throw new Error(`${name} must be at least 32 characters`);
  }

  if (
    lowered.includes('replace') ||
    lowered.includes('secret') ||
    lowered.includes('changeme') ||
    lowered.includes('example')
  ) {
    throw new Error(`${name} appears weak or placeholder-like. Use a strong random secret.`);
  }

  return value;
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return String(value).toLowerCase() === 'true';
}

function parseSameSite(value, fallback = 'lax') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'strict' || normalized === 'lax' || normalized === 'none') return normalized;
  return fallback;
}

function parseTrustProxy(value) {
  if (value === undefined || value === null || value === '') return false;

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  const asNumber = Number(normalized);
  if (Number.isInteger(asNumber) && asNumber >= 0) return asNumber;

  return value;
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseEmailProvider(value) {
  const normalized = String(value || 'smtp').trim().toLowerCase();

  if (normalized !== 'smtp' && normalized !== 'sendgrid') {
    throw new Error(
      `EMAIL_PROVIDER must be either "smtp" or "sendgrid" (received "${normalized}")`
    );
  }

  return normalized;
}

/**
 * Remove accidental formatting issues from secrets
 */
function stripCred(value) {
  if (value === undefined || value === null) return '';

  return String(value)
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

const nodeEnv = process.env.NODE_ENV || 'development';
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

function buildTrustedOrigins() {
  const origins = new Set([clientUrl]);

  const extra = String(process.env.TRUSTED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const o of extra) origins.add(o);

  if (nodeEnv !== 'production') {
    origins.add('http://localhost:5173');
    origins.add('http://localhost:5174');
  }

  return [...origins];
}

/**
 * Safepay config (UNCHANGED LOGIC)
 */
const SAFEPAY_RESOLVED_API_HOST = {
  sandbox: 'https://sandbox.api.getsafepay.com',
  production: 'https://api.getsafepay.com',
};

const safepayEnvRaw = stripCred(process.env.SAFEPAY_ENV || '');
const safepayEnvLower = safepayEnvRaw.toLowerCase();

let safepayEnvTier;

if (!safepayEnvRaw || safepayEnvLower === 'sandbox') {
  safepayEnvTier = 'sandbox';
} else if (safepayEnvLower === 'production' || safepayEnvLower === 'prod') {
  safepayEnvTier = 'production';
} else {
  throw new Error(
    `[safepay] SAFEPAY_ENV must be "sandbox" or "production" (got "${safepayEnvRaw}")`
  );
}

const safepayMerchantSecret = stripCred(
  process.env.SAFEPAY_MERCHANT_SECRET ||
  process.env.SAFEPAY_SECRET_KEY ||
  process.env.SAFEPAY_API_KEY ||
  ''
);

const safepayMerchantPublishableKey =
  stripCred(process.env.SAFEPAY_MERCHANT_API_KEY || process.env.SAFEPAY_PUBLIC_KEY || '') || '';

const safepayWebhookSecretHex = stripCred(process.env.SAFEPAY_WEBHOOK_SECRET || '')
  .replace(/^0x/i, '')
  .trim();

const safepayWebhookSecretFinal =
  safepayWebhookSecretHex || safepayMerchantSecret;

const safepayMisconfiguredHalves =
  Boolean(safepayMerchantSecret) !== Boolean(safepayMerchantPublishableKey);

if (safepayMisconfiguredHalves && (safepayMerchantSecret || safepayMerchantPublishableKey)) {
  throw new Error(
    '[safepay] Both secret and publishable key are required'
  );
}

if (
  safepayMerchantSecret &&
  safepayMerchantPublishableKey &&
  safepayMerchantSecret === safepayMerchantPublishableKey
) {
  throw new Error('[safepay] Secret and publishable key must differ');
}

/**
 * EXPORT ENV
 */
export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 4000),
  clientUrl,

  mysql: {
    host: required('MYSQL_HOST', '127.0.0.1'),
    port: Number(process.env.MYSQL_PORT || 3306),
    user: required('MYSQL_USER', ''),
    password: required('MYSQL_PASSWORD', ''),
    database: required('MYSQL_DATABASE', ''),
  },

  redis: {
    url: process.env.REDIS_URL || '',
  },

  jwt: {
    accessSecret: requiredJwtSecret('JWT_ACCESS_SECRET'),
    refreshSecret: requiredJwtSecret('JWT_REFRESH_SECRET'),
    previousAccessSecrets: parseCsv(process.env.JWT_ACCESS_PREVIOUS_SECRETS),
    previousRefreshSecrets: parseCsv(process.env.JWT_REFRESH_PREVIOUS_SECRETS),
    issuer: process.env.JWT_ISSUER || 'mrb-learning',
    audience: process.env.JWT_AUDIENCE || 'mrb-learning-clients',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  security: {
    requireRedisInProduction: parseBoolean(process.env.REQUIRE_REDIS_IN_PRODUCTION, true),
    allowLegacyTokenVersion: parseBoolean(process.env.ALLOW_LEGACY_TOKEN_VERSION, false),
    trustedOrigins: buildTrustedOrigins(),
    refreshCookieSameSite: parseSameSite(process.env.REFRESH_COOKIE_SAMESITE, 'lax'),
    refreshCookieSecure: parseBoolean(process.env.REFRESH_COOKIE_SECURE, nodeEnv === 'production'),
    refreshCookiePath: process.env.REFRESH_COOKIE_PATH || '/api/auth',
    csrfCookiePath: process.env.CSRF_COOKIE_PATH || '/',
    accessCookieSameSite: parseSameSite(process.env.ACCESS_COOKIE_SAMESITE, 'lax'),
    accessCookieSecure: parseBoolean(process.env.ACCESS_COOKIE_SECURE, nodeEnv === 'production'),
    accessCookiePath: process.env.ACCESS_COOKIE_PATH || '/api',
    accessCookieMaxAgeMs: Number(process.env.ACCESS_COOKIE_MAX_AGE_MS || 15 * 60 * 1000),
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    authChallengeKey: process.env.AUTH_CHALLENGE_KEY || '',
  },

  email: {
    provider: parseEmailProvider(process.env.EMAIL_PROVIDER),
    from: process.env.EMAIL_FROM || '',
    sendgridApiKey: process.env.SENDGRID_API_KEY || '',
    sendgridSandboxMode: parseBoolean(process.env.EMAIL_SANDBOX_MODE, false),
    host: process.env.SMTP_HOST || '',
    port: parseNumber(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    secure: parseBoolean(process.env.SMTP_SECURE, false),
  },

  safepay: {
    apiKey: safepayMerchantSecret,
    publicKey: safepayMerchantPublishableKey,
    env: safepayEnvTier,
    apiHost: SAFEPAY_RESOLVED_API_HOST[safepayEnvTier],
    webhookSecretHex: safepayWebhookSecretHex,
    webhookSecretIsDedicated: Boolean(safepayWebhookSecretHex),
    webhookTimestampSkewSeconds: parseNumber(
      process.env.SAFEPAY_WEBHOOK_TIMESTAMP_SKEW_SECONDS,
      300
    ),
    webhookMaxPayloadBytes: parseNumber(
      process.env.SAFEPAY_WEBHOOK_MAX_BYTES,
      524288
    ),
    webhookReplayTtlSeconds: parseNumber(
      process.env.SAFEPAY_WEBHOOK_REPLAY_TTL_SECONDS,
      86400
    ),
  },
};
