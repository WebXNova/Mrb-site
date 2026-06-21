/**
 * Ensures teacher_subjects junction and role guard trigger on existing databases.
 */

async function tableExists(pool, db, tableName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, tableName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function triggerExists(pool, db, triggerName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TRIGGERS
     WHERE TRIGGER_SCHEMA = ? AND TRIGGER_NAME = ?`,
    [db, triggerName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

const CREATE_TEACHER_SUBJECTS_SQL = `
CREATE TABLE IF NOT EXISTS teacher_subjects (
  teacher_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  assigned_by BIGINT NULL,
  assigned_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (teacher_id, subject_id),
  KEY idx_teacher_subjects_subject (subject_id),
  KEY idx_teacher_subjects_assigned_by (assigned_by),
  CONSTRAINT fk_teacher_subjects_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_teacher_subjects_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_teacher_subjects_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const TEACHER_ROLE_TRIGGER_SQL = `
CREATE TRIGGER trg_teacher_subjects_teacher_role_before_insert
BEFORE INSERT ON teacher_subjects
FOR EACH ROW
BEGIN
  IF (
    SELECT COUNT(*) FROM users u
    WHERE u.id = NEW.teacher_id AND u.role = 'teacher'
  ) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'teacher_id must reference a user with role=teacher';
  END IF;
END
`;

async function ensureTeacherRoleTrigger(pool, db) {
  if (!(await tableExists(pool, db, 'teacher_subjects'))) return;

  const triggerName = 'trg_teacher_subjects_teacher_role_before_insert';
  if (await triggerExists(pool, db, triggerName)) return;

  try {
    await pool.query(`DROP TRIGGER IF EXISTS ${triggerName}`);
    await pool.query(TEACHER_ROLE_TRIGGER_SQL);
    console.log('[schema] Created teacher_subjects role guard trigger');
  } catch (error) {
    console.warn('[schema] Could not create teacher_subjects role trigger:', error.message);
  }
}

export async function ensureTeacherSubjectsSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  if (!(await tableExists(mysqlPool, db, 'users'))) return;
  if (!(await tableExists(mysqlPool, db, 'subjects'))) return;

  if (!(await tableExists(mysqlPool, db, 'teacher_subjects'))) {
    await mysqlPool.query(CREATE_TEACHER_SUBJECTS_SQL);
    console.log('[schema] Created teacher_subjects');
  }

  await ensureTeacherRoleTrigger(mysqlPool, db);

  if (await tableExists(mysqlPool, db, 'teacher_subjects')) {
    console.log('[schema] teacher_subjects ready');
  }
}
