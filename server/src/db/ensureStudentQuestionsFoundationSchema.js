/**
 * Additive bootstrap for student_questions relational foundation columns.
 * Idempotent — safe on every server start.
 */

async function columnExists(pool, db, table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, table, column]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function indexExists(pool, db, table, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [db, table, indexName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function addColumnIfMissing(pool, db, table, column, ddl) {
  if (await columnExists(pool, db, table, column)) return false;
  await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  return true;
}

export async function ensureStudentQuestionsFoundationSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  const [tableRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'student_questions'`,
    [db]
  );
  if (Number(tableRows[0]?.n ?? 0) === 0) return;

  const added = [];
  if (await addColumnIfMissing(mysqlPool, db, 'student_questions', 'course_id', 'course_id BIGINT NULL')) {
    added.push('course_id');
  }
  if (await addColumnIfMissing(mysqlPool, db, 'student_questions', 'subject_id', 'subject_id BIGINT NULL')) {
    added.push('subject_id');
  }
  if (
    await addColumnIfMissing(
      mysqlPool,
      db,
      'student_questions',
      'assigned_teacher_id',
      'assigned_teacher_id BIGINT NULL'
    )
  ) {
    added.push('assigned_teacher_id');
  }
  if (await addColumnIfMissing(mysqlPool, db, 'student_questions', 'seen_at', 'seen_at TIMESTAMP NULL')) {
    added.push('seen_at');
  }
  if (await addColumnIfMissing(mysqlPool, db, 'student_questions', 'audio_url', 'audio_url VARCHAR(1000) NULL')) {
    added.push('audio_url');
  }
  if (
    await addColumnIfMissing(
      mysqlPool,
      db,
      'student_questions',
      'answer_attachment_url',
      'answer_attachment_url VARCHAR(1000) NULL'
    )
  ) {
    added.push('answer_attachment_url');
  }
  if (
    await addColumnIfMissing(
      mysqlPool,
      db,
      'student_questions',
      'answer_audio_url',
      'answer_audio_url VARCHAR(1000) NULL'
    )
  ) {
    added.push('answer_audio_url');
  }
  if (
    await addColumnIfMissing(
      mysqlPool,
      db,
      'student_questions',
      'teacher_pinned_at',
      'teacher_pinned_at TIMESTAMP NULL'
    )
  ) {
    added.push('teacher_pinned_at');
  }
  if (
    await addColumnIfMissing(
      mysqlPool,
      db,
      'student_questions',
      'teacher_thread_ref',
      'teacher_thread_ref VARCHAR(22) NULL'
    )
  ) {
    added.push('teacher_thread_ref');
  }

  if (!(await indexExists(mysqlPool, db, 'student_questions', 'idx_sq_course_subject_status'))) {
    try {
      await mysqlPool.query(
        `ALTER TABLE student_questions ADD KEY idx_sq_course_subject_status (course_id, subject_id, status)`
      );
    } catch (error) {
      console.warn('[schema] idx_sq_course_subject_status:', error.message);
    }
  }

  if (!(await indexExists(mysqlPool, db, 'student_questions', 'idx_sq_teacher_inbox'))) {
    try {
      await mysqlPool.query(
        `ALTER TABLE student_questions ADD KEY idx_sq_teacher_inbox (assigned_teacher_id, status, updated_at)`
      );
    } catch (error) {
      console.warn('[schema] idx_sq_teacher_inbox:', error.message);
    }
  }

  if (!(await indexExists(mysqlPool, db, 'student_questions', 'idx_sq_teacher_thread_ref'))) {
    try {
      await mysqlPool.query(
        `ALTER TABLE student_questions ADD KEY idx_sq_teacher_thread_ref (assigned_teacher_id, teacher_thread_ref)`
      );
    } catch (error) {
      console.warn('[schema] idx_sq_teacher_thread_ref:', error.message);
    }
  }

  if (!(await indexExists(mysqlPool, db, 'student_questions', 'idx_sq_teacher_user_updated'))) {
    try {
      await mysqlPool.query(
        `ALTER TABLE student_questions ADD KEY idx_sq_teacher_user_updated (assigned_teacher_id, user_id, updated_at)`
      );
    } catch (error) {
      console.warn('[schema] idx_sq_teacher_user_updated:', error.message);
    }
  }

  if (added.length) {
    console.log(`[schema] student_questions foundation columns added: ${added.join(', ')}`);
  }
}
