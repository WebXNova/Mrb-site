/**
 * Bound any thenable so student-facing requests cannot wait indefinitely.
 */

import { ExternalRequestTimeoutError } from '../errors/external/ExternalRequestTimeoutError.js';

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} timeoutMs
 * @param {{ dependency?: string, message?: string, httpStatus?: number, buildError?: () => Error }} [options]
 * @returns {Promise<T>}
 */
export async function withDeadline(promise, timeoutMs, options = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          if (typeof options.buildError === 'function') {
            reject(options.buildError());
            return;
          }
          reject(
            new ExternalRequestTimeoutError({
              timeoutMs,
              dependency: options.dependency || null,
              message: options.message,
              httpStatus: options.httpStatus,
            })
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fetch with AbortSignal deadline.
 *
 * @param {string|URL} url
 * @param {RequestInit & { timeoutMs?: number, dependency?: string }} [init]
 */
export async function fetchWithDeadline(url, init = {}) {
  const { timeoutMs = 5_000, dependency = 'http', ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
      throw new ExternalRequestTimeoutError({
        timeoutMs,
        dependency,
        cause: error instanceof Error ? error : null,
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
