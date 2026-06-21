/**
 * Idempotent bootstrap for course_drafts (admin course wizard server-side drafts).
 */

async function tableExists(pool, db, table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, table]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function ensureCourseDraftsSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  if (!(await tableExists(mysqlPool, db, 'users'))) return;
  if (await tableExists(mysqlPool, db, 'course_drafts')) return;

  await mysqlPool.query(`
    CREATE TABLE course_drafts (
      user_id BIGINT NOT NULL PRIMARY KEY,
      draft_json JSON NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_course_drafts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[migration] course_drafts: table created');
}
