/**
 * Centralized MySQL pool configuration — env parsing + production safety validation.
 *
 * mysql2 treats queueLimit=0 as an unlimited queue; never allow 0 or non-finite values.
 * Acquire timeout is enforced at runtime by installMysqlPoolTimeoutGuard (see mysql.js).
 */

import { isProductionNodeEnv } from './validateProductionStartup.js';

/** @typedef {import('./mysql.js').getMysqlPoolConfig extends () => infer R ? R : never} MysqlPoolConfig */

export const MYSQL_POOL_ENV_KEYS = Object.freeze({
  connectionLimit: 'MYSQL_POOL_CONNECTION_LIMIT',
  queueLimit: 'MYSQL_POOL_QUEUE_LIMIT',
  connectTimeoutMs: 'MYSQL_CONNECT_TIMEOUT_MS',
  acquireTimeoutMs: 'MYSQL_POOL_ACQUIRE_TIMEOUT_MS',
  acquireTimeoutAlias: 'MYSQL_POOL_ACQUIRE_TIMEOUT',
  queryTimeoutMs: 'MYSQL_QUERY_TIMEOUT_MS',
  transactionTimeoutMs: 'MYSQL_TRANSACTION_TIMEOUT_MS',
});

const DEFAULTS = Object.freeze({
  connectionLimit: 30,
  queueLimit: 100,
  connectTimeoutMs: 8000,
  acquireTimeoutMs: 10_000,
  queryTimeoutMs: 30_000,
  transactionTimeoutMs: 60_000,
});

/**
 * Positive integer env var: missing/empty → fallback; present but invalid → throw.
 *
 * @param {string} name
 * @param {number} fallback
 * @param {NodeJS.ProcessEnv} processEnv
 */
function parsePositiveIntEnv(name, fallback, processEnv) {
  const raw = processEnv[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return fallback;
  }

  const trimmed = String(raw).trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${name} must be a positive integer (received "${raw}")`);
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer (received "${raw}")`);
  }

  return parsed;
}

/**
 * @param {unknown} value
 */
export function isFinitePoolQueueLimit(value) {
  return Number.isInteger(value) && Number(value) > 0;
}

/**
 * @param {unknown} value
 */
export function isPositivePoolTimeoutMs(value) {
  return Number.isInteger(value) && Number(value) > 0;
}

/**
 * Resolve pool tuning from environment variables.
 *
 * @param {NodeJS.ProcessEnv} [processEnv]
 * @returns {MysqlPoolConfig}
 */
export function parseMysqlPoolConfigFromEnv(processEnv = process.env) {
  const acquireTimeoutRaw =
    processEnv[MYSQL_POOL_ENV_KEYS.acquireTimeoutMs] ??
    processEnv[MYSQL_POOL_ENV_KEYS.acquireTimeoutAlias];

  const acquireProcessEnv =
    acquireTimeoutRaw === undefined
      ? processEnv
      : {
          ...processEnv,
          [MYSQL_POOL_ENV_KEYS.acquireTimeoutMs]: acquireTimeoutRaw,
        };

  return {
    connectionLimit: parsePositiveIntEnv(
      MYSQL_POOL_ENV_KEYS.connectionLimit,
      DEFAULTS.connectionLimit,
      processEnv
    ),
    queueLimit: parsePositiveIntEnv(MYSQL_POOL_ENV_KEYS.queueLimit, DEFAULTS.queueLimit, processEnv),
    connectTimeoutMs: parsePositiveIntEnv(
      MYSQL_POOL_ENV_KEYS.connectTimeoutMs,
      DEFAULTS.connectTimeoutMs,
      processEnv
    ),
    acquireTimeoutMs: parsePositiveIntEnv(
      MYSQL_POOL_ENV_KEYS.acquireTimeoutMs,
      DEFAULTS.acquireTimeoutMs,
      acquireProcessEnv
    ),
    queryTimeoutMs: parsePositiveIntEnv(
      MYSQL_POOL_ENV_KEYS.queryTimeoutMs,
      DEFAULTS.queryTimeoutMs,
      processEnv
    ),
    transactionTimeoutMs: parsePositiveIntEnv(
      MYSQL_POOL_ENV_KEYS.transactionTimeoutMs,
      DEFAULTS.transactionTimeoutMs,
      processEnv
    ),
  };
}

/**
 * @param {Partial<MysqlPoolConfig>} config
 * @returns {string[]}
 */
export function collectMysqlPoolSafetyIssues(config) {
  const issues = [];

  if (!Number.isInteger(config.connectionLimit) || Number(config.connectionLimit) <= 0) {
    issues.push('connectionLimit');
  }

  if (!isFinitePoolQueueLimit(config.queueLimit)) {
    issues.push('queueLimit');
  }

  if (!isPositivePoolTimeoutMs(config.acquireTimeoutMs)) {
    issues.push('acquireTimeoutMs');
  }

  return issues;
}

/**
 * Fail closed in production; warn in non-production when pool limits are unsafe.
 *
 * @param {Partial<MysqlPoolConfig>} config
 * @param {{ nodeEnv?: string }} [options]
 */
export function validateMysqlPoolConfigAtStartup(config, options = {}) {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const issues = collectMysqlPoolSafetyIssues(config);

  if (issues.length === 0) {
    if (isProductionNodeEnv(nodeEnv)) {
      console.log('[startup] MySQL pool configuration validated', {
        connectionLimit: config.connectionLimit,
        queueLimit: config.queueLimit,
        acquireTimeoutMs: config.acquireTimeoutMs,
      });
    }
    return;
  }

  const payload = {
    unsafe: issues,
    connectionLimit: config.connectionLimit,
    queueLimit: config.queueLimit,
    acquireTimeoutMs: config.acquireTimeoutMs,
    envKeys: MYSQL_POOL_ENV_KEYS,
  };

  if (isProductionNodeEnv(nodeEnv)) {
    console.error('[startup] MySQL pool configuration unsafe for production:', payload);
    throw new Error(
      `Production startup blocked. Unsafe MySQL pool configuration: ${issues.join(', ')}. ` +
        'queueLimit must be a positive integer (mysql2 treats 0 as unlimited); ' +
        'acquireTimeoutMs must be a positive integer (enforced by pool timeout guard).'
    );
  }

  console.warn('[startup] MySQL pool configuration warnings (non-production):', payload);
}
