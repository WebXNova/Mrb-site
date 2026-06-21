/**
 * Ensures student_questions table exists on existing databases.
 * Full schema.sql only runs when base geo schema (provinces) is absent.
 */

async function tableExists(pool, db, tableName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, tableName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

const CREATE_STUDENT_QUESTIONS_SQL = `
CREATE TABLE IF NOT EXISTS student_questions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  course_id BIGINT NULL,
  subject_id BIGINT NULL,
  assigned_teacher_id BIGINT NULL,
  subject VARCHAR(32) NOT NULL,
  title VARCHAR(220) NOT NULL,
  body TEXT NOT NULL,
  attachment_url VARCHAR(1000) NULL,
  audio_url VARCHAR(1000) NULL,
  answer TEXT NULL,
  answer_attachment_url VARCHAR(1000) NULL,
  answer_audio_url VARCHAR(1000) NULL,
  status ENUM('pending', 'answered') NOT NULL DEFAULT 'pending',
  seen_at TIMESTAMP NULL,
  teacher_pinned_at TIMESTAMP NULL,
  answered_by BIGINT NULL,
  answered_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sq_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sq_course_id FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_sq_subject_id FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_sq_assigned_teacher_id FOREIGN KEY (assigned_teacher_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_sq_answered_by FOREIGN KEY (answered_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  KEY idx_sq_user_id (user_id),
  KEY idx_sq_status (status),
  KEY idx_sq_created_at (created_at),
  KEY idx_sq_updated_at (updated_at),
  KEY idx_sq_course_id (course_id),
  KEY idx_sq_subject_id (subject_id),
  KEY idx_sq_assigned_teacher_id (assigned_teacher_id),
  KEY idx_student_questions_user_created (user_id, created_at DESC),
  KEY idx_student_questions_status_subject (status, subject),
  KEY idx_sq_course_subject_status (course_id, subject_id, status),
  KEY idx_sq_teacher_inbox (assigned_teacher_id, status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export async function ensureStudentQuestionsSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  if (!(await tableExists(mysqlPool, db, 'users'))) {
    console.warn('[schema] student_questions skipped — users table missing');
    return;
  }
  if (!(await tableExists(mysqlPool, db, 'courses'))) {
    console.warn('[schema] student_questions skipped — courses table missing');
    return;
  }
  if (!(await tableExists(mysqlPool, db, 'subjects'))) {
    console.warn('[schema] student_questions skipped — subjects table missing');
    return;
  }

  if (!(await tableExists(mysqlPool, db, 'student_questions'))) {
    await mysqlPool.query(CREATE_STUDENT_QUESTIONS_SQL);
    console.log('[schema] Created student_questions');
  }

  if (await tableExists(mysqlPool, db, 'student_questions')) {
    console.log('[schema] student_questions ready');
  }
}
