/**
 * H-01 — Enrollment integrity: one user + one course = one enrollment row.
 */

const MIGRATION_NAME = 'enrollment_user_course_unique';

async function indexExists(mysqlPool, db, table, indexName) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [db, table, indexName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function tableExists(mysqlPool, db, table) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, table]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function ensureEnrollmentUserCourseUniqueSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };

  if (!(await tableExists(mysqlPool, db, 'enrollments'))) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'enrollments_missing' };
  }

  const hasUniqueIndex = await indexExists(mysqlPool, db, 'enrollments', 'uq_enrollments_user_course');
  const [dupCountRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n FROM (
       SELECT user_id, course_id
       FROM enrollments
       GROUP BY user_id, course_id
       HAVING COUNT(*) > 1
     ) d`
  );
  const duplicateGroups = Number(dupCountRows[0]?.n ?? 0);
  const steps = [];

  if (duplicateGroups > 0 || !hasUniqueIndex) {
    steps.push({
      name: 'merge_order_id_to_canonical_enrollment',
      sql: `UPDATE enrollments e_keep
      INNER JOIN (
        SELECT user_id, course_id, MIN(id) AS keep_id
        FROM enrollments
        GROUP BY user_id, course_id
        HAVING COUNT(*) > 1
      ) g ON g.keep_id = e_keep.id
      INNER JOIN enrollments e_dup
        ON e_dup.user_id = g.user_id AND e_dup.course_id = g.course_id AND e_dup.id <> g.keep_id
      SET e_keep.order_id = e_dup.order_id
      WHERE e_keep.order_id IS NULL AND e_dup.order_id IS NOT NULL`,
    });

    steps.push({
      name: 'repoint_orders_enrollment_id_to_canonical',
      sql: `UPDATE orders o
      INNER JOIN enrollments e_dup ON e_dup.id = o.enrollment_id
      INNER JOIN (
        SELECT user_id, course_id, MIN(id) AS keep_id
        FROM enrollments
        GROUP BY user_id, course_id
      ) g ON g.user_id = e_dup.user_id AND g.course_id = e_dup.course_id
      SET o.enrollment_id = g.keep_id
      WHERE o.enrollment_id <> g.keep_id`,
    });

    steps.push({
      name: 'dedupe_enrollments_user_course',
      sql: `DELETE e_dup FROM enrollments e_dup
      INNER JOIN (
        SELECT user_id, course_id, MIN(id) AS keep_id
        FROM enrollments
        GROUP BY user_id, course_id
        HAVING COUNT(*) > 1
      ) d ON d.user_id = e_dup.user_id AND d.course_id = e_dup.course_id
      WHERE e_dup.id <> d.keep_id`,
    });
  }

  if (!hasUniqueIndex) {
    steps.push({
      name: 'add_uq_enrollments_user_course',
      sql: `ALTER TABLE enrollments
        ADD UNIQUE KEY uq_enrollments_user_course (user_id, course_id)`,
    });
  }

  const executed = [];
  for (const step of steps) {
    if (dryRun) {
      executed.push({ ...step, dryRun: true });
      continue;
    }
    console.log(`[migration] ${MIGRATION_NAME}: step "${step.name}" — running`);
    await mysqlPool.query(step.sql);
    console.log(`[migration] ${MIGRATION_NAME}: step "${step.name}" — ok`);
    executed.push({ name: step.name, ok: true });
  }

  return { migration: MIGRATION_NAME, dryRun, duplicateGroups, steps: executed };
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function rollbackEnrollmentUserCourseUniqueSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, rollback: true, skipped: true, reason: 'no_database' };

  if (!(await indexExists(mysqlPool, db, 'enrollments', 'uq_enrollments_user_course'))) {
    return { migration: MIGRATION_NAME, rollback: true, skipped: true, reason: 'index_not_present' };
  }

  const sql = 'ALTER TABLE enrollments DROP INDEX uq_enrollments_user_course';
  if (dryRun) return { migration: MIGRATION_NAME, rollback: true, dryRun: true, sql };

  await mysqlPool.query(sql);
  return { migration: MIGRATION_NAME, rollback: true, ok: true };
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 */
export async function analyzeEnrollmentUserCourseDuplicates(mysqlPool) {
  const [dupes] = await mysqlPool.query(
    `SELECT user_id, course_id, COUNT(*) AS cnt, GROUP_CONCAT(id ORDER BY id) AS ids
     FROM enrollments
     GROUP BY user_id, course_id
     HAVING COUNT(*) > 1`
  );
  const [[{ indexPresent }]] = await mysqlPool.query(
    `SELECT COUNT(*) AS indexPresent
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'enrollments'
       AND INDEX_NAME = 'uq_enrollments_user_course'`
  );
  return {
    duplicateGroups: dupes.length,
    duplicates: dupes,
    uniqueIndexPresent: Number(indexPresent) > 0,
    migrationReady: dupes.length === 0,
  };
}
