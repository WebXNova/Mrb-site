/**
 * G-04 — superseded question_bank cleanup after quiz-draft rematerialization.
 *
 * Orphan path: materialization DELETEs test_questions links then INSERTs new
 * question_bank rows, leaving prior bank rows unlinked.
 *
 * Safety rules (all required):
 *  - Only candidates explicitly unlinked from the current test in this transaction
 *  - Skip when still linked to any test (shared / concurrent link)
 *  - Skip when referenced by student_answers (attempt + result history)
 *  - Soft-delete only (deleted_at / deleted_by) — never hard DELETE
 */

import {
  listLinkedQuestionIdsForTest,
  softDeleteUnlinkedSupersededQuestions,
} from '../repositories/testQuizDraftMaterialization.repository.js';

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{
 *   testId: number,
 *   deletedByUserId: number|null|undefined,
 * }} params
 * @returns {Promise<number[]>} question ids linked before link replacement
 */
export async function snapshotSupersededQuestionIds(connection, testId) {
  return listLinkedQuestionIdsForTest(connection, testId);
}

/**
 * Soft-delete superseded rows that are safe to retire.
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{
 *   supersededQuestionIds: number[],
 *   deletedByUserId: number|null|undefined,
 * }} params
 * @returns {Promise<{ candidateCount: number, deletedCount: number, skippedCount: number }>}
 */
export async function softDeleteSupersededMaterializedQuestions(
  connection,
  { supersededQuestionIds, deletedByUserId }
) {
  const ids = [
    ...new Set(
      (Array.isArray(supersededQuestionIds) ? supersededQuestionIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];

  if (!ids.length) {
    return { candidateCount: 0, deletedCount: 0, skippedCount: 0 };
  }

  const deletedBy = Number(deletedByUserId);
  if (!Number.isInteger(deletedBy) || deletedBy <= 0) {
    return { candidateCount: ids.length, deletedCount: 0, skippedCount: ids.length };
  }

  return softDeleteUnlinkedSupersededQuestions(connection, ids, deletedBy);
}
