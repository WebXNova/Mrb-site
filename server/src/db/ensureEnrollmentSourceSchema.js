/**
 * Ensures `enrollments.enrollment_source` exists (free | paid).
 * Canonical enrollment table — not a separate user_course_enrollments table.
 */
export async function ensureEnrollmentSourceSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  const [tableRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'enrollments'`,
    [db]
  );
  if (Number(tableRows[0]?.n) === 0) return;

  const [colRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'enrollments' AND COLUMN_NAME = 'enrollment_source'`,
    [db]
  );
  if (Number(colRows[0]?.n) === 0) {
    await mysqlPool.query(
      `ALTER TABLE enrollments
       ADD COLUMN enrollment_source ENUM('free', 'paid') NULL DEFAULT NULL
       AFTER access_status`
    );
    console.log('[schema] Added enrollments.enrollment_source (free, paid)');
  }

  const [idxRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'enrollments' AND INDEX_NAME = 'idx_enrollments_user_course_access'`,
    [db]
  );
  if (Number(idxRows[0]?.n) === 0) {
    await mysqlPool.query(
      `ALTER TABLE enrollments ADD KEY idx_enrollments_user_course_access (user_id, course_id, access_status)`
    );
    console.log('[schema] Added idx_enrollments_user_course_access');
  }
}
