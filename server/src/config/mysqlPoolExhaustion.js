import { MySqlPoolExhaustedError } from '../errors/mysql/MySqlPoolExhaustedError.js';

const EXHAUSTION_MARKER = Symbol('mysqlPoolExhaustionGuardInstalled');

const QUEUE_LIMIT_PATTERNS = [
  /queue limit reached/i,
];

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isMysqlPoolQueueExhaustedError(err) {
  if (!err || typeof err !== 'object') return false;
  if (err instanceof MySqlPoolExhaustedError) return true;

  const message = String(/** @type {{ message?: string }} */ (err).message || '');
  return QUEUE_LIMIT_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * @param {unknown} err
 * @returns {never}
 */
function rethrowPoolError(err) {
  if (isMysqlPoolQueueExhaustedError(err)) {
    throw new MySqlPoolExhaustedError({
      cause: err instanceof Error ? err : undefined,
    });
  }
  throw err;
}

/**
 * Wrap pool methods so queue exhaustion returns a stable 503 operational error.
 *
 * @param {import('mysql2/promise').Pool} pool
 */
export function installMysqlPoolExhaustionGuard(pool) {
  if (pool[EXHAUSTION_MARKER]) {
    return pool;
  }

  const originalGetConnection = pool.getConnection.bind(pool);
  pool.getConnection = async function guardedGetConnection() {
    try {
      return await originalGetConnection();
    } catch (err) {
      rethrowPoolError(err);
    }
  };

  const originalQuery = pool.query.bind(pool);
  pool.query = async function guardedQuery(sql, values) {
    try {
      return await originalQuery(sql, values);
    } catch (err) {
      rethrowPoolError(err);
    }
  };

  if (typeof pool.execute === 'function') {
    const originalExecute = pool.execute.bind(pool);
    pool.execute = async function guardedExecute(sql, values) {
      try {
        return await originalExecute(sql, values);
      } catch (err) {
        rethrowPoolError(err);
      }
    };
  }

  pool[EXHAUSTION_MARKER] = true;
  return pool;
}
