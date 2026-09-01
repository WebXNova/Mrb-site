/**
 * Additive: courses.finished_at — set only by Mark Course Finished.
 * Not an ENUM; display layer maps revoked enrollments to "Course Finished".
 */

export async function ensureCourseFinishedSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  const [tbl] = await mysqlPool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'courses'`,
    [db]
  );
  if (Number(tbl[0]?.n ?? 0) === 0) return;

  const [cols] = await mysqlPool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'finished_at'`,
    [db]
  );
  if (Number(cols[0]?.n ?? 0) > 0) return;

  await mysqlPool.query(`
    ALTER TABLE courses
      ADD COLUMN finished_at DATETIME NULL
        COMMENT 'Set when admin marks the course finished; independent of is_active'
        AFTER admission_status
  `);
  console.log('[schema] Added courses.finished_at');
}
