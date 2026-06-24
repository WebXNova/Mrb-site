/**
 * Idempotent schema migration – adds `status` ENUM column to `courses`.
 * Run manually or wire into server startup.
 */

export async function ensureCourseStatusSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  const [cols] = await mysqlPool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'status'`,
    [db]
  );
  if (cols.length > 0) {
    console.log('[migration] courses.status — already exists, skipping');
    return;
  }

  await mysqlPool.query(`
    ALTER TABLE courses
      ADD COLUMN status ENUM('draft','published','archived')
        NOT NULL DEFAULT 'draft'
        AFTER admission_status
  `);
  console.log('[migration] courses.status — column added');

  const [backfillResult] = await mysqlPool.query(`
    UPDATE courses c
      SET c.status = 'published'
      WHERE c.is_active = TRUE
        AND c.id IN (
          SELECT cb.course_id FROM course_batches cb
          WHERE cb.status IN ('published','upcoming','enrollment_open','running')
        )
  `);
  console.log('[migration] courses.status — published backfill:', backfillResult.affectedRows, 'rows');

  const [archiveResult] = await mysqlPool.query(`
    UPDATE courses c
      SET c.status = 'archived'
      WHERE c.is_active = FALSE
        OR (c.id IN (
              SELECT cb.course_id FROM course_batches cb
              WHERE cb.status IN ('completed','cancelled')
            )
            AND c.id NOT IN (
              SELECT cb.course_id FROM course_batches cb
              WHERE cb.status IN ('published','upcoming','enrollment_open','running')
            ))
  `);
  console.log('[migration] courses.status — archived backfill:', archiveResult.affectedRows, 'rows');

  await mysqlPool.query(`
    CREATE INDEX idx_courses_status ON courses(status)
  `);
  console.log('[migration] courses.status — index created');
}
