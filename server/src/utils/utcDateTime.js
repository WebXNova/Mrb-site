/**
 * UTC datetime standard for instructional runtime (G-RT-03).
 *
 * Storage:   MySQL DATETIME columns hold UTC wall-clock strings (YYYY-MM-DD HH:mm:ss).
 * Wire/API:  ISO-8601 with Z suffix.
 * Compare:   parseUtcMySqlInstant → epoch ms; authoritative now via fetchUtcNowMs (MySQL UTC_TIMESTAMP).
 */

import { formatMySqlDateTime } from './dateTime.js';
import {
  fetchUtcNowMs,
  parseTestAvailabilityInstant,
  toAvailabilityIso,
} from '../services/testAvailabilityWindow.service.js';

export { formatMySqlDateTime, fetchUtcNowMs, toAvailabilityIso };

/** @typedef {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} MysqlExecutor */

/**
 * Parse a UTC MySQL DATETIME / ISO value to epoch ms.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function parseUtcMySqlInstant(value) {
  return parseTestAvailabilityInstant(value);
}

/**
 * Serialize a UTC instant for MySQL DATETIME columns.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function serializeUtcMySqlDateTime(value) {
  return formatMySqlDateTime(value);
}

/**
 * API-safe ISO UTC string from DB/admin value.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function utcInstantToIso(value) {
  return toAvailabilityIso(value);
}

/**
 * Authoritative availability clock — MySQL UTC_TIMESTAMP(3).
 *
 * @param {MysqlExecutor} executor
 * @returns {Promise<number>}
 */
export async function getAvailabilityNowMs(executor) {
  return fetchUtcNowMs(executor);
}
