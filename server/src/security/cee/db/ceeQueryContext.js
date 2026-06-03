/**
 * Async query context — ties validated CEE scope to mysql2 executor calls.
 *
 * When CEE_ENFORCE_INSTRUCTIONAL_POOL_GUARD is enabled, raw pool.query on protected
 * tables requires an active context from scopedQuery / wrapExecutorWithScopeGuard.
 */

import { AsyncLocalStorage } from 'async_hooks';

/**
 * @typedef {object} CeeQueryContext
 * @property {boolean} validated — guard passed for this SQL execution
 * @property {boolean} [allowUnscoped]
 * @property {number|null} [courseId]
 * @property {string} [context]
 * @property {number|null} [userId]
 * @property {string|null} [requestId]
 */

export const ceeQueryContextStorage = new AsyncLocalStorage();

/**
 * @returns {CeeQueryContext|undefined}
 */
export function getCeeQueryContext() {
  return ceeQueryContextStorage.getStore();
}

/**
 * @param {CeeQueryContext} context
 * @param {() => Promise<T>|T} fn
 * @returns {Promise<T>|T}
 * @template T
 */
export function runWithCeeQueryContext(context, fn) {
  return ceeQueryContextStorage.run(context, fn);
}

/**
 * @returns {boolean}
 */
export function isInstructionalPoolGuardEnabled() {
  if (process.env.NODE_ENV === 'test') return false;
  const raw = process.env.CEE_ENFORCE_INSTRUCTIONAL_POOL_GUARD;
  if (raw === undefined || raw === '') {
    return process.env.NODE_ENV === 'production';
  }
  return String(raw).toLowerCase() === 'true';
}
