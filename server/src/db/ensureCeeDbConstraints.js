/**
 * CEE database integrity constraints (application-enforced; no triggers).
 *
 * - tests.course_id NOT NULL when no orphans
 * - Legacy enrollment triggers dropped if present (no CREATE — no SUPER required)
 */

import { dropLegacyEnrollmentTriggers } from '../services/enrollmentLifecycle.service.js';

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 */
export async function ensureCeeDbConstraints(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  await dropLegacyEnrollmentTriggers(mysqlPool);
  await ensureTestsCourseIdNotNull(mysqlPool, db);
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} db
 */
async function ensureTestsCourseIdNotNull(pool, db) {
  const [colRows] = await pool.query(
    `SELECT IS_NULLABLE AS nullable
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tests' AND COLUMN_NAME = 'course_id'
     LIMIT 1`,
    [db]
  );
  if (!colRows.length) return;

  if (String(colRows[0].nullable).toUpperCase() === 'NO') {
    return;
  }

  const [orphanRows] = await pool.query(
    `SELECT COUNT(*) AS n FROM tests WHERE course_id IS NULL`
  );
  const orphanCount = Number(orphanRows[0]?.n ?? 0);
  if (orphanCount > 0) {
    console.warn(
      `[CEE.schema] tests.course_id still nullable — ${orphanCount} orphan test(s). ` +
        'Backfill course_id before NOT NULL enforcement (see sql/migrations/cee_db_constraints.sql).'
    );
    return;
  }

  await pool.query(`ALTER TABLE tests MODIFY COLUMN course_id BIGINT NOT NULL`);
  console.log('[CEE.schema] tests.course_id enforced NOT NULL');
}
