/**
 * Centralized production startup validation — fail closed before accepting traffic.
 * Dev/test: no-op. Production: throw with explicit missing keys (never warn-only).
 */

const PRODUCTION_REQUIRED_ENV_KEYS = Object.freeze([
  'REDIS_URL',
  'SAFEPAY_WEBHOOK_SECRET',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'ADMIN_SECRET_PATH',
]);

/**
 * @param {string | undefined} nodeEnv
 */
export function isProductionNodeEnv(nodeEnv = process.env.NODE_ENV) {
  return String(nodeEnv || 'development').trim().toLowerCase() === 'production';
}

/**
 * @param {string | undefined} raw
 */
function isRequireRedisDisabled(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return false;
  }
  const normalized = String(raw).trim().toLowerCase();
  return normalized === 'false' || normalized === '0' || normalized === 'no';
}

/**
 * TRUST_PROXY must be explicitly configured for production deployments behind a proxy/LB.
 *
 * @param {string | undefined} raw
 */
export function isTrustProxyConfigured(raw = process.env.TRUST_PROXY) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return false;
  }

  const normalized = String(raw).trim().toLowerCase();
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  if (normalized === 'true') {
    return true;
  }

  const asNumber = Number(normalized);
  if (Number.isInteger(asNumber) && asNumber >= 1) {
    return true;
  }

  return normalized.length > 0;
}

/**
 * Collect production-required env keys that are missing or invalid.
 *
 * @param {NodeJS.ProcessEnv} [processEnv]
 * @returns {string[]}
 */
export function collectProductionStartupConfigIssues(processEnv = process.env) {
  const missing = [];

  for (const key of PRODUCTION_REQUIRED_ENV_KEYS) {
    const value = processEnv[key];
    if (value === undefined || value === null || String(value).trim() === '') {
      missing.push(key);
    }
  }

  if (!isTrustProxyConfigured(processEnv.TRUST_PROXY)) {
    missing.push('TRUST_PROXY');
  }

  if (
    isProductionNodeEnv(processEnv.NODE_ENV) &&
    isRequireRedisDisabled(processEnv.REQUIRE_REDIS_IN_PRODUCTION)
  ) {
    missing.push('REQUIRE_REDIS_IN_PRODUCTION (must not be false in production)');
  }

  if (
    isProductionNodeEnv(processEnv.NODE_ENV) &&
    String(processEnv.ALLOW_ADMIN_BOOTSTRAP || '').trim().toLowerCase() === 'true'
  ) {
    missing.push('ALLOW_ADMIN_BOOTSTRAP (must not be true in production)');
  }

  return missing;
}

/**
 * Fail closed in production when required configuration is missing.
 *
 * @param {{ nodeEnv?: string, processEnv?: NodeJS.ProcessEnv }} [options]
 */
export function validateProductionStartupConfig(options = {}) {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  if (!isProductionNodeEnv(nodeEnv)) {
    return;
  }

  const processEnv = options.processEnv ?? process.env;
  const missing = collectProductionStartupConfigIssues(processEnv);

  if (missing.length === 0) {
    console.log('[startup] Production configuration validated', {
      required: [...PRODUCTION_REQUIRED_ENV_KEYS, 'TRUST_PROXY'],
    });
    return;
  }

  console.error('[startup] Production startup blocked — missing or invalid required configuration:', {
    missing,
  });

  throw new Error(
    `Production startup blocked. Missing or invalid required environment variables: ${missing.join(', ')}`
  );
}
