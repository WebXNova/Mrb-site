/**
 * Idempotent streak columns on users for Learning Hub activity tracking.
 */

export async function ensureStudentStreakSchema(pool) {
  const [[dbRow]] = await pool.query('SELECT DATABASE() AS db');
  const db = dbRow?.db;
  if (!db) return;

  const [rows] = await pool.query(
    `SELECT COLUMN_NAME AS name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME IN ('learning_streak_count', 'learning_streak_last_date')`,
    [db]
  );
  const existing = new Set(rows.map((r) => r.name));

  if (!existing.has('learning_streak_count')) {
    await pool.query(
      `ALTER TABLE users
       ADD COLUMN learning_streak_count INT NOT NULL DEFAULT 0
       AFTER status`
    );
  }

  if (!existing.has('learning_streak_last_date')) {
    await pool.query(
      `ALTER TABLE users
       ADD COLUMN learning_streak_last_date DATE NULL
       AFTER learning_streak_count`
    );
  }
}
