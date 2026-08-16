/**
 * Idempotent schema ensure — course notes attachments.
 */

const MIGRATION_NAME = 'course_notes';

async function tableExists(mysqlPool, db, tableName) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, tableName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function ensureCourseNotesSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };

  if (await tableExists(mysqlPool, db, 'notes')) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'table_exists' };
  }

  const sql = `
CREATE TABLE IF NOT EXISTS notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT NOT NULL,
  subject_id BIGINT NULL,
  chapter_id BIGINT UNSIGNED NULL,
  lecture_id BIGINT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  file_url VARCHAR(512) NOT NULL,
  file_type ENUM('pdf', 'image', 'docx') NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  uploaded_by BIGINT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_notes_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_notes_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
  CONSTRAINT fk_notes_chapter FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL,
  CONSTRAINT fk_notes_lecture FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE SET NULL,
  CONSTRAINT fk_notes_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id),
  KEY idx_notes_course_id (course_id),
  KEY idx_notes_subject_id (subject_id),
  KEY idx_notes_chapter_id (chapter_id),
  KEY idx_notes_lecture_id (lecture_id),
  KEY idx_notes_course_active (course_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

  if (dryRun) {
    return { migration: MIGRATION_NAME, dryRun: true, sql };
  }

  await mysqlPool.query(sql);
  return { migration: MIGRATION_NAME, ok: true };
}
