/**
 * Ensures teacher_answers + teacher_activity_logs exist and backfills legacy inline answers.
 */

async function tableExists(pool, db, tableName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, tableName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

const CREATE_TEACHER_ANSWERS_SQL = `
CREATE TABLE IF NOT EXISTS teacher_answers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  question_id BIGINT NOT NULL,
  teacher_id BIGINT NOT NULL,
  answer TEXT NOT NULL,
  answer_attachment_url VARCHAR(1000) NULL,
  answer_audio_url VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ta_question_id FOREIGN KEY (question_id) REFERENCES student_questions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ta_teacher_id FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY uq_ta_question_id (question_id),
  KEY idx_ta_teacher_id (teacher_id),
  KEY idx_ta_teacher_created (teacher_id, created_at DESC),
  KEY idx_ta_question_created (question_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CREATE_TEACHER_ACTIVITY_LOGS_SQL = `
CREATE TABLE IF NOT EXISTS teacher_activity_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  teacher_id BIGINT NOT NULL,
  question_id BIGINT NULL,
  action_type ENUM('QUESTION_VIEWED', 'QUESTION_ANSWERED', 'ANSWER_UPDATED', 'LOGIN', 'LOGOUT') NOT NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tal_teacher_id FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tal_question_id FOREIGN KEY (question_id) REFERENCES student_questions(id) ON DELETE SET NULL ON UPDATE CASCADE,
  KEY idx_tal_teacher_id (teacher_id),
  KEY idx_tal_action_type (action_type),
  KEY idx_tal_created_at (created_at),
  KEY idx_tal_teacher_action_created (teacher_id, action_type, created_at DESC),
  KEY idx_tal_question_id (question_id),
  KEY idx_tal_teacher_created (teacher_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function backfillTeacherAnswers(pool) {
  const [result] = await pool.query(
    `INSERT INTO teacher_answers (question_id, teacher_id, answer, answer_attachment_url, answer_audio_url, created_at, updated_at)
     SELECT
       sq.id,
       COALESCE(sq.answered_by, sq.assigned_teacher_id),
       sq.answer,
       sq.answer_attachment_url,
       sq.answer_audio_url,
       COALESCE(sq.answered_at, sq.updated_at, sq.created_at),
       COALESCE(sq.answered_at, sq.updated_at, sq.created_at)
     FROM student_questions sq
     WHERE sq.status = 'answered'
       AND sq.answer IS NOT NULL
       AND TRIM(sq.answer) <> ''
       AND COALESCE(sq.answered_by, sq.assigned_teacher_id) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM teacher_answers ta WHERE ta.question_id = sq.id
       )`
  );
  const inserted = Number(result?.affectedRows ?? 0);
  if (inserted > 0) {
    console.log(`[schema] Backfilled ${inserted} teacher_answers from student_questions`);
  }
}

export async function ensureTeacherQaMonitoringSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  if (!(await tableExists(mysqlPool, db, 'users'))) {
    console.warn('[schema] teacher Q&A monitoring skipped — users table missing');
    return;
  }
  if (!(await tableExists(mysqlPool, db, 'student_questions'))) {
    console.warn('[schema] teacher Q&A monitoring skipped — student_questions table missing');
    return;
  }

  if (!(await tableExists(mysqlPool, db, 'teacher_answers'))) {
    await mysqlPool.query(CREATE_TEACHER_ANSWERS_SQL);
    console.log('[schema] Created teacher_answers');
  }

  if (!(await tableExists(mysqlPool, db, 'teacher_activity_logs'))) {
    await mysqlPool.query(CREATE_TEACHER_ACTIVITY_LOGS_SQL);
    console.log('[schema] Created teacher_activity_logs');
  }

  if (await tableExists(mysqlPool, db, 'teacher_answers')) {
    await backfillTeacherAnswers(mysqlPool);
  }

  console.log('[schema] teacher Q&A monitoring ready');
}
