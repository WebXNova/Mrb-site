/**
 * Backfill test_subjects for legacy tests and re-sync lifecycle status.
 */

import { mysqlPool } from '../config/mysql.js';
import { isPublishedDbStatus, syncTestLifecycleStatus } from './testCompleteness.service.js';

/**
 * Normalize legacy test_type values and default category.
 * @param {import('mysql2/promise').Pool} [pool]
 */
export async function migrateLegacyTestTypes(pool = mysqlPool) {
  await pool.query(`UPDATE tests SET category = 'MDCAT' WHERE category IS NULL OR TRIM(category) = ''`);
  const [result] = await pool.query(
    `UPDATE tests
     SET test_type = 'mixed_subject'
     WHERE deleted_at IS NULL
       AND (
         test_type IS NULL
         OR TRIM(test_type) = ''
         OR test_type NOT IN ('subject_wise', 'mixed_subject')
       )`
  );
  return Number(result.affectedRows ?? 0);
}

/**
 * Match legacy tests.subject text to course subjects and insert test_subjects.
 * Tests with no match stay without rows → completeness stays INCOMPLETE until Step 1 re-save.
 * @param {import('mysql2/promise').Pool} [pool]
 */
export async function backfillTestSubjectsFromLegacySubject(pool = mysqlPool) {
  const [insertResult] = await pool.query(
    `INSERT IGNORE INTO test_subjects (test_id, subject_id)
     SELECT t.id, s.id
     FROM tests t
     INNER JOIN subjects s
       ON s.course_id = t.course_id
      AND s.is_active = TRUE
      AND LOWER(TRIM(s.title)) = LOWER(TRIM(t.subject))
     WHERE t.deleted_at IS NULL
       AND t.subject IS NOT NULL
       AND TRIM(t.subject) <> ''
       AND NOT EXISTS (SELECT 1 FROM test_subjects ts WHERE ts.test_id = t.id)`
  );

  const linked = Number(insertResult.affectedRows ?? 0);

  await pool.query(
    `UPDATE tests t
     INNER JOIN (
       SELECT test_id, COUNT(*) AS cnt
       FROM test_subjects
       GROUP BY test_id
     ) ts ON ts.test_id = t.id
     SET t.test_type = 'subject_wise'
     WHERE t.deleted_at IS NULL
       AND ts.cnt = 1
       AND t.test_type = 'mixed_subject'`
  );

  return { linked };
}

/**
 * Re-sync lifecycle for all non-published tests (INCOMPLETE / DRAFT / READY_FOR_PUBLISH).
 * @param {import('mysql2/promise').Pool} [pool]
 */
export async function resyncAllTestLifecycleStatuses(pool = mysqlPool) {
  const [rows] = await pool.query(
    `SELECT id, status FROM tests WHERE deleted_at IS NULL`
  );

  let synced = 0;
  for (const row of rows) {
    if (isPublishedDbStatus(row.status)) continue;
    await syncTestLifecycleStatus(Number(row.id), pool);
    synced += 1;
  }
  return synced;
}

/**
 * Full legacy data pass: types → subject backfill → lifecycle sync.
 * @param {import('mysql2/promise').Pool} [pool]
 */
export async function runTestSubjectsBackfill(pool = mysqlPool) {
  const typesUpdated = await migrateLegacyTestTypes(pool);
  const { linked } = await backfillTestSubjectsFromLegacySubject(pool);
  const lifecycleSynced = await resyncAllTestLifecycleStatuses(pool);

  const [missingRows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM tests t
     WHERE t.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM test_subjects ts WHERE ts.test_id = t.id)`
  );
  const stillMissingSubjects = Number(missingRows[0]?.n ?? 0);

  return {
    typesUpdated,
    subjectsLinked: linked,
    lifecycleSynced,
    stillMissingSubjects,
  };
}
