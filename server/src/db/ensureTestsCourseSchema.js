/**
 * Ensures tests.course_id exists for CEE course-bound test access.
 */
export async function ensureTestsCourseSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  const [tableRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tests'`,
    [db]
  );
  if (Number(tableRows[0]?.n) === 0) return;

  const [colRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tests' AND COLUMN_NAME = 'course_id'`,
    [db]
  );
  if (Number(colRows[0]?.n) > 0) return;

  await mysqlPool.query(
    `ALTER TABLE tests
     ADD COLUMN course_id BIGINT NULL AFTER id,
     ADD KEY idx_tests_course (course_id),
     ADD CONSTRAINT fk_tests_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE`
  );
  console.log('[schema] Added tests.course_id for CEE');
}
