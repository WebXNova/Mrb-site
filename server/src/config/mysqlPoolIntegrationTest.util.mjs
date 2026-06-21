/**
 * Test-only helpers for MySQL pool integration tests — prevents indefinite hangs.
 * Not used by production pool wiring.
 */
import { raceWithTimeout } from './mysqlTimeout.util.js';

export const TEST_SUITE_MAX_MS = 30_000;
export const GET_CONNECTION_TEST_TIMEOUT_MS = 8_000;
export const ALL_SETTLED_TEST_TIMEOUT_MS = 25_000;
export const POOL_END_TEST_TIMEOUT_MS = 5_000;

/**
 * Force process exit if the suite exceeds the wall-clock budget.
 */
export function installTestSuiteWatchdog(maxMs = TEST_SUITE_MAX_MS) {
  const timer = setTimeout(() => {
    console.error(`\n✗ TEST SUITE WATCHDOG: exceeded ${maxMs}ms — forcing exit`);
    process.exit(1);
  }, maxMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  return timer;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} [timeoutMs]
 * @returns {Promise<import('mysql2/promise').PoolConnection>}
 */
export async function acquireConnectionWithTimeout(pool, timeoutMs = GET_CONNECTION_TEST_TIMEOUT_MS) {
  return raceWithTimeout(
    pool.getConnection(),
    timeoutMs,
    () => new Error(`getConnection timed out after ${timeoutMs}ms`),
    (conn) => {
      try {
        conn.release();
      } catch {
        /* ignore late release races */
      }
    }
  );
}

/**
 * @param {Array<Promise<unknown>>} promises
 * @param {number} [timeoutMs]
 */
export async function allSettledWithTimeout(promises, timeoutMs = ALL_SETTLED_TEST_TIMEOUT_MS) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.allSettled(promises),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Promise.allSettled timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * @param {import('mysql2/promise').Pool | null | undefined} pool
 */
export async function endPoolSafely(pool) {
  if (!pool) {
    return;
  }

  try {
    await raceWithTimeout(
      pool.end(),
      POOL_END_TEST_TIMEOUT_MS,
      () => new Error(`pool.end() timed out after ${POOL_END_TEST_TIMEOUT_MS}ms`)
    );
  } catch (error) {
    console.warn('[mysql-pool-test] pool.end() failed:', error?.message || error);
  }
}

/**
 * @param {() => Promise<unknown>} fn
 * @param {number} [timeoutMs]
 */
export async function runWithTimeout(fn, timeoutMs = GET_CONNECTION_TEST_TIMEOUT_MS) {
  return raceWithTimeout(
    fn(),
    timeoutMs,
    () => new Error(`operation timed out after ${timeoutMs}ms`)
  );
}
