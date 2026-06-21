/**
 * Idempotent bootstrap for lecture_progress table (student lecture completion tracking).
 */

async function tableExists(pool, db, table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, table]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function ensureLectureProgressSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  if (await tableExists(mysqlPool, db, 'lecture_progress')) return;

  await mysqlPool.query(`
    CREATE TABLE lecture_progress (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      lecture_id BIGINT NOT NULL,
      course_id BIGINT NOT NULL,
      status ENUM('completed') NOT NULL DEFAULT 'completed',
      completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_lecture_progress_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_lecture_progress_lecture FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE,
      CONSTRAINT fk_lecture_progress_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      UNIQUE KEY uq_lecture_progress_user_lecture (user_id, lecture_id),
      KEY idx_lecture_progress_user_course (user_id, course_id),
      KEY idx_lecture_progress_course (course_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  console.log('[migration] lecture_progress: table created');
}
