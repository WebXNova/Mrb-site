import { MySqlAcquireTimeoutError } from '../errors/mysql/MySqlAcquireTimeoutError.js';
import { MySqlQueryTimeoutError } from '../errors/mysql/MySqlQueryTimeoutError.js';

const QUERY_TIMEOUT_PATTERNS = [
  /query inactivity timeout/i,
  /PROTOCOL_SEQUENCE_TIMEOUT/i,
  /ER_QUERY_TIMEOUT/i,
];

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isMysqlQueryTimeoutError(err) {
  if (!err || typeof err !== 'object') return false;
  if (err instanceof MySqlQueryTimeoutError) return true;

  const code = String(/** @type {{ code?: string }} */ (err).code || '');
  const message = String(/** @type {{ message?: string }} */ (err).message || '');
  if (QUERY_TIMEOUT_PATTERNS.some((pattern) => pattern.test(code) || pattern.test(message))) {
    return true;
  }
  return false;
}

/**
 * @param {unknown} err
 * @param {number} timeoutMs
 * @returns {never}
 */
export function rethrowQueryTimeout(err, timeoutMs) {
  if (isMysqlQueryTimeoutError(err)) {
    throw new MySqlQueryTimeoutError({ timeoutMs, cause: err instanceof Error ? err : null });
  }
  throw err;
}

/**
 * Race an operation against a wall-clock timeout (used for pool acquire).
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} timeoutMs
 * @param {() => Error} buildTimeoutError
 * @param {(lateResult: T) => void | Promise<void>} [onLateResolve]
 * @returns {Promise<T>}
 */
export async function raceWithTimeout(promise, timeoutMs, buildTimeoutError, onLateResolve) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let settled = false;
  let timer = null;

  const guarded = promise.then(
    async (value) => {
      if (settled) {
        if (onLateResolve) {
          await onLateResolve(value);
        }
        return /** @type {T} */ (undefined);
      }
      settled = true;
      if (timer) clearTimeout(timer);
      return value;
    },
    (err) => {
      if (settled) {
        return Promise.reject(err);
      }
      settled = true;
      if (timer) clearTimeout(timer);
      return Promise.reject(err);
    }
  );

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(buildTimeoutError());
    }, timeoutMs);
  });

  const raced = Promise.race([guarded, timeout]);
  guarded.catch(() => {
    /* timeout may have won first — swallow late rejection */
  });
  return raced;
}

/**
 * Apply mysql2 per-query inactivity timeout unless caller already set one.
 *
 * @param {unknown} sql
 * @param {unknown} values
 * @param {number} defaultTimeoutMs
 * @returns {[unknown, unknown]}
 */
export function withQueryTimeoutOptions(sql, values, defaultTimeoutMs) {
  if (!Number.isFinite(defaultTimeoutMs) || defaultTimeoutMs <= 0) {
    return [sql, values];
  }

  if (typeof sql === 'string') {
    return [{ sql, timeout: defaultTimeoutMs }, values];
  }

  if (sql && typeof sql === 'object' && !Array.isArray(sql)) {
    const options = /** @type {Record<string, unknown>} */ ({ ...sql });
    if (options.timeout == null) {
      options.timeout = defaultTimeoutMs;
    }
    return [options, values];
  }

  return [sql, values];
}
