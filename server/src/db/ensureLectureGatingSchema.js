/**
 * Additive bootstrap for lecture gating configuration on course_batches.
 */

async function columnExists(pool, db, table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, table, column]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function tableExists(pool, db, table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, table]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function ensureLectureGatingSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  if (!(await tableExists(mysqlPool, db, 'course_batches'))) return;

  if (!(await columnExists(mysqlPool, db, 'course_batches', 'sequential_lectures_enabled'))) {
    await mysqlPool.query(
      `ALTER TABLE course_batches
       ADD COLUMN sequential_lectures_enabled TINYINT(1) NOT NULL DEFAULT 0
       AFTER recordings_enabled`
    );
    console.log('[migration] course_batches.sequential_lectures_enabled: column added');
  }
}
