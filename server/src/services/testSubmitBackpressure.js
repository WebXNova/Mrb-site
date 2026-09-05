/**
 * Per-worker in-flight submit cap so a synchronized class submit does not
 * exhaust the MySQL pool (≈15 conns/worker). Excess requests fail closed with
 * 503 + retry hint; clients already treat submit as idempotent.
 */

import { ApiError } from '../utils/apiError.js';

function parseMaxInFlight() {
  const n = Number(process.env.TEST_SUBMIT_MAX_IN_FLIGHT_PER_WORKER);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
}

let inFlight = 0;

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withSubmitBackpressure(fn) {
  const max = parseMaxInFlight();
  if (inFlight >= max) {
    throw new ApiError(
      503,
      'Too many exam submissions in progress. Please wait a moment and try again.',
      {
        code: 'SUBMIT_BACKPRESSURE',
        error_code: 'SUBMIT_BACKPRESSURE',
        retryAfterMs: 2000,
      }
    );
  }
  inFlight += 1;
  try {
    return await fn();
  } finally {
    inFlight = Math.max(0, inFlight - 1);
  }
}

/** @returns {number} */
export function getSubmitInFlightCount() {
  return inFlight;
}
