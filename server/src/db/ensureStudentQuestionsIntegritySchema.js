/**
 * Idempotent schema patch: student_questions FK + index hardening.
 * Mirrors sql/migrations/student_questions_integrity_hardening.sql for Node-driven deploys.
 */

const MIGRATION_NAME = 'student_questions_integrity_hardening';

async function tableExists(pool, db, table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, table]
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

async function leftmostIndexOnColumn(pool, db, table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? AND SEQ_IN_INDEX = 1`,
    [db, table, column]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function constraintExists(pool, db, table, name, type = 'FOREIGN KEY') {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = ?`,
    [db, table, name, type]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function anyFkExists(pool, db, table, names) {
  for (const name of names) {
    if (await constraintExists(pool, db, table, name, 'FOREIGN KEY')) return true;
  }
  return false;
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 */
export async function auditStudentQuestionsOrphans(mysqlPool) {
  const checks = [
    {
      name: 'orphan_user_id',
      sql: `SELECT COUNT(*) AS n FROM student_questions sq LEFT JOIN users u ON u.id = sq.user_id WHERE u.id IS NULL`,
    },
    {
      name: 'orphan_course_id',
      sql: `SELECT COUNT(*) AS n FROM student_questions sq LEFT JOIN courses c ON c.id = sq.course_id WHERE sq.course_id IS NOT NULL AND c.id IS NULL`,
    },
    {
      name: 'orphan_subject_id',
      sql: `SELECT COUNT(*) AS n FROM student_questions sq LEFT JOIN subjects s ON s.id = sq.subject_id WHERE sq.subject_id IS NOT NULL AND s.id IS NULL`,
    },
    {
      name: 'orphan_assigned_teacher_id',
      sql: `SELECT COUNT(*) AS n FROM student_questions sq LEFT JOIN users u ON u.id = sq.assigned_teacher_id WHERE sq.assigned_teacher_id IS NOT NULL AND u.id IS NULL`,
    },
    {
      name: 'orphan_answered_by',
      sql: `SELECT COUNT(*) AS n FROM student_questions sq LEFT JOIN users u ON u.id = sq.answered_by WHERE sq.answered_by IS NOT NULL AND u.id IS NULL`,
    },
    {
      name: 'assigned_teacher_wrong_role',
      sql: `SELECT COUNT(*) AS n FROM student_questions sq INNER JOIN users u ON u.id = sq.assigned_teacher_id WHERE u.role <> 'teacher'`,
    },
    {
      name: 'subject_course_mismatch',
      sql: `SELECT COUNT(*) AS n FROM student_questions sq INNER JOIN subjects s ON s.id = sq.subject_id WHERE sq.course_id IS NOT NULL AND sq.course_id <> s.course_id`,
    },
  ];

  const results = {};
  for (const check of checks) {
    const [[row]] = await mysqlPool.query(check.sql);
    results[check.name] = Number(row?.n ?? 0);
  }
  return results;
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean, skipOrphanCheck?: boolean }} [opts]
 */
export async function ensureStudentQuestionsIntegritySchema(mysqlPool, { dryRun = false, skipOrphanCheck = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };

  if (!(await tableExists(mysqlPool, db, 'student_questions'))) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'student_questions_missing' };
  }
  if (!(await tableExists(mysqlPool, db, 'users'))) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'users_missing' };
  }

  if (!skipOrphanCheck) {
    const orphans = await auditStudentQuestionsOrphans(mysqlPool);
    const blocking = Object.entries(orphans).filter(([, n]) => n > 0);
    if (blocking.length > 0) {
      return {
        migration: MIGRATION_NAME,
        skipped: true,
        reason: 'orphans_detected',
        orphans,
        hint: 'Run student_questions_orphan_cleanup.sql after backup',
      };
    }
  }

  const steps = [];
  const indexDefs = [
    ['idx_sq_user_id', 'user_id'],
    ['idx_sq_status', 'status'],
    ['idx_sq_created_at', 'created_at'],
    ['idx_sq_updated_at', 'updated_at'],
    ['idx_sq_course_id', 'course_id'],
    ['idx_sq_subject_id', 'subject_id'],
    ['idx_sq_assigned_teacher_id', 'assigned_teacher_id'],
  ];

  for (const [indexName, column] of indexDefs) {
    if (!(await indexExists(mysqlPool, db, 'student_questions', indexName))) {
      if (!(await leftmostIndexOnColumn(mysqlPool, db, 'student_questions', column))) {
        steps.push({
          name: `add_${indexName}`,
          sql: `ALTER TABLE student_questions ADD INDEX ${indexName} (${column}), ALGORITHM=INPLACE, LOCK=NONE`,
        });
      }
    }
  }

  if (!(await indexExists(mysqlPool, db, 'student_questions', 'idx_sq_teacher_inbox'))) {
    steps.push({
      name: 'add_idx_sq_teacher_inbox',
      sql: 'ALTER TABLE student_questions ADD INDEX idx_sq_teacher_inbox (assigned_teacher_id, status, updated_at), ALGORITHM=INPLACE, LOCK=NONE',
    });
  }

  if (!(await indexExists(mysqlPool, db, 'student_questions', 'idx_sq_course_subject_status'))) {
    steps.push({
      name: 'add_idx_sq_course_subject_status',
      sql: 'ALTER TABLE student_questions ADD INDEX idx_sq_course_subject_status (course_id, subject_id, status), ALGORITHM=INPLACE, LOCK=NONE',
    });
  }

  if (!(await anyFkExists(mysqlPool, db, 'student_questions', ['fk_sq_user_id', 'fk_student_questions_user']))) {
    steps.push({
      name: 'add_fk_sq_user_id',
      sql: 'ALTER TABLE student_questions ADD CONSTRAINT fk_sq_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE',
    });
  }

  if (await tableExists(mysqlPool, db, 'courses')) {
    if (!(await constraintExists(mysqlPool, db, 'student_questions', 'fk_sq_course_id'))) {
      steps.push({
        name: 'add_fk_sq_course_id',
        sql: 'ALTER TABLE student_questions ADD CONSTRAINT fk_sq_course_id FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL ON UPDATE CASCADE',
      });
    }
  }

  if (await tableExists(mysqlPool, db, 'subjects')) {
    if (!(await constraintExists(mysqlPool, db, 'student_questions', 'fk_sq_subject_id'))) {
      steps.push({
        name: 'add_fk_sq_subject_id',
        sql: 'ALTER TABLE student_questions ADD CONSTRAINT fk_sq_subject_id FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL ON UPDATE CASCADE',
      });
    }
  }

  if (!(await constraintExists(mysqlPool, db, 'student_questions', 'fk_sq_assigned_teacher_id'))) {
    steps.push({
      name: 'add_fk_sq_assigned_teacher_id',
      sql: 'ALTER TABLE student_questions ADD CONSTRAINT fk_sq_assigned_teacher_id FOREIGN KEY (assigned_teacher_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE',
    });
  }

  if (!(await anyFkExists(mysqlPool, db, 'student_questions', ['fk_sq_answered_by', 'fk_student_questions_answered_by']))) {
    steps.push({
      name: 'add_fk_sq_answered_by',
      sql: 'ALTER TABLE student_questions ADD CONSTRAINT fk_sq_answered_by FOREIGN KEY (answered_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE',
    });
  }

  const executed = [];
  if (dryRun) {
    return { migration: MIGRATION_NAME, dryRun: true, steps: steps.map((s) => s.name) };
  }

  for (const step of steps) {
    await mysqlPool.query(step.sql);
    executed.push(step.name);
  }

  return { migration: MIGRATION_NAME, executed };
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function rollbackStudentQuestionsIntegritySchema(mysqlPool, { dryRun = false } = {}) {
  const fks = [
    'fk_sq_user_id',
    'fk_sq_course_id',
    'fk_sq_subject_id',
    'fk_sq_assigned_teacher_id',
    'fk_sq_answered_by',
  ];
  const indexes = [
    'idx_sq_user_id',
    'idx_sq_status',
    'idx_sq_created_at',
    'idx_sq_updated_at',
    'idx_sq_course_id',
    'idx_sq_subject_id',
    'idx_sq_assigned_teacher_id',
  ];

  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  const steps = [];

  for (const fk of fks) {
    if (await constraintExists(mysqlPool, db, 'student_questions', fk, 'FOREIGN KEY')) {
      steps.push({ name: `drop_${fk}`, sql: `ALTER TABLE student_questions DROP FOREIGN KEY ${fk}` });
    }
  }
  for (const idx of indexes) {
    if (await indexExists(mysqlPool, db, 'student_questions', idx)) {
      steps.push({ name: `drop_${idx}`, sql: `ALTER TABLE student_questions DROP INDEX ${idx}` });
    }
  }

  if (dryRun) return { migration: MIGRATION_NAME, rollback: true, dryRun: true, steps: steps.map((s) => s.name) };

  const executed = [];
  for (const step of steps) {
    await mysqlPool.query(step.sql);
    executed.push(step.name);
  }
  return { migration: MIGRATION_NAME, rollback: true, executed };
}
