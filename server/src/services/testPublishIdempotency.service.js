/**
 * Publish idempotency — safe replay for POST /admin/tests/:id/publish (G-05).
 *
 * STRATEGY (layered):
 * 1. Domain replay — test row already `published` → return same success payload (no error).
 * 2. Row lock — SELECT … FOR UPDATE serializes concurrent publish attempts per test.
 * 3. Optional header replay — idempotencyMiddleware + Idempotency-Key caches 2xx responses.
 *
 * Materialization has its own draft-version idempotency inside the publish transaction.
 */

import { AppError } from '../errors/base/AppError.js';
import { NOT_FOUND } from '../errors/codes/ErrorCodes.js';
import { loadTestPublishScopeRow } from '../repositories/testQuizDraftMaterialization.repository.js';
import { isPublishedDbStatus } from './testCompleteness.service.js';

export const PUBLISH_IDEMPOTENT_REPLAY_REASON = 'PUBLISH_ALREADY_PUBLISHED';

/**
 * @param {Record<string, unknown>|null|undefined} testRow
 */
export function isPublishIdempotentReplay(testRow) {
  return Boolean(testRow && isPublishedDbStatus(testRow.status));
}

/**
 * Lock the test row inside an open publish transaction.
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} testId
 */
export async function lockTestRowForPublish(connection, testId) {
  const tid = Number(testId);
  const row = await loadTestPublishScopeRow(connection, tid);
  if (!row) {
    throw new AppError({
      message: 'Test was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { testId: tid },
    });
  }
  return row;
}

/**
 * Attach replay metadata for clients that want to distinguish first publish vs replay.
 *
 * @param {Record<string, unknown>|null} test
 * @param {{ idempotentReplay?: boolean }} [options]
 */
export function formatPublishResponse(test, { idempotentReplay = false } = {}) {
  if (!test) return null;
  if (!idempotentReplay) return test;
  return {
    ...test,
    publishReplay: true,
  };
}
