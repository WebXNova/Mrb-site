import crypto from 'crypto';
import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { formatMySqlDateTime } from '../utils/dateTime.js';

/**
 * Idempotency service for replay protection
 * 
 * Stores request hashes and responses to detect duplicate submissions.
 * Protects against refreshes, network retries, duplicate tabs, double clicks.
 */

const IDEMPOTENCY_TTL_HOURS = 24;

/**
 * Generate a hash of the request payload for validation
 * @param {object} payload 
 * @returns {string} SHA-256 hash
 */
function hashPayload(payload) {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Check if an idempotency key exists and return cached response if valid
 * 
 * @param {string} idempotencyKey - Client-provided idempotency key
 * @param {object} payload - Request payload
 * @param {string} endpoint - API endpoint path
 * @param {string} method - HTTP method
 * @returns {Promise<{replay: boolean, response?: object, statusCode?: number}>}
 */
export async function checkIdempotency(idempotencyKey, payload, endpoint, method) {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    return { replay: false };
  }

  const key = String(idempotencyKey).trim();
  if (key.length === 0 || key.length > 255) {
    throw new ApiError(400, 'Invalid idempotency key format', { 
      code: 'INVALID_IDEMPOTENCY_KEY' 
    });
  }

  const requestHash = hashPayload(payload);

  try {
    const [rows] = await mysqlPool.query(
      `SELECT 
        idempotency_key,
        request_hash,
        status_code,
        response_body,
        expires_at
       FROM idempotency_keys
       WHERE idempotency_key = ?
       LIMIT 1`,
      [key]
    );

    if (rows.length === 0) {
      return { replay: false };
    }

    const record = rows[0];
    
    // Check if expired
    const now = new Date();
    const expiresAt = new Date(record.expires_at);
    if (now >= expiresAt) {
      // Clean up expired record
      await mysqlPool.query(
        `DELETE FROM idempotency_keys WHERE idempotency_key = ?`,
        [key]
      );
      return { replay: false };
    }

    // Verify request hash matches
    if (record.request_hash !== requestHash) {
      throw new ApiError(409, 'Idempotency key reused with different payload', {
        code: 'IDEMPOTENCY_KEY_MISMATCH',
      });
    }

    // Return cached response
    return {
      replay: true,
      statusCode: record.status_code,
      response: typeof record.response_body === 'string' 
        ? JSON.parse(record.response_body)
        : record.response_body,
    };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // Log error but don't fail the request on idempotency check failures
    console.error('[idempotency] Check failed:', e);
    return { replay: false };
  }
}

/**
 * Store a successful response for replay protection
 * 
 * @param {string} idempotencyKey 
 * @param {object} payload 
 * @param {number} statusCode 
 * @param {object} responseBody 
 * @param {string} endpoint 
 * @param {string} method 
 * @param {number|null} userId 
 */
export async function storeIdempotencyResponse(
  idempotencyKey,
  payload,
  statusCode,
  responseBody,
  endpoint,
  method,
  userId = null
) {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    return;
  }

  const key = String(idempotencyKey).trim();
  if (key.length === 0 || key.length > 255) {
    return;
  }

  const requestHash = hashPayload(payload);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + IDEMPOTENCY_TTL_HOURS);
  const expiresAtFormatted = formatMySqlDateTime(expiresAt, { fieldName: 'expires_at' });

  try {
    await mysqlPool.query(
      `INSERT INTO idempotency_keys (
        idempotency_key,
        request_hash,
        status_code,
        response_body,
        user_id,
        endpoint,
        method,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        request_hash = VALUES(request_hash),
        status_code = VALUES(status_code),
        response_body = VALUES(response_body),
        expires_at = VALUES(expires_at)`,
      [
        key,
        requestHash,
        statusCode,
        JSON.stringify(responseBody),
        userId,
        endpoint.slice(0, 255),
        method.slice(0, 10),
        expiresAtFormatted,
      ]
    );
  } catch (e) {
    // Log error but don't fail the request on storage failures
    console.error('[idempotency] Store failed:', e);
  }
}

/**
 * Clean up expired idempotency keys (scheduled job entrypoint).
 * @param {{ dryRun?: boolean }} [opts]
 * @returns {Promise<number>} rows deleted (0 for dry-run)
 */
export async function cleanupExpiredIdempotencyKeys(opts = {}) {
  const { runIdempotencyCleanup } = await import('./idempotencyCleanup.service.js');
  const summary = await runIdempotencyCleanup({ dryRun: Boolean(opts.dryRun) });
  return Number(summary.deleted ?? 0);
}
