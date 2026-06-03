/**
 * Idempotent schema patch: question_bank soft-delete hardening.
 * Adds deleted_by, indexes, FK, and optional CHECK for existing databases.
 *
 * Fresh installs should use schema.sql; this mirrors the SQL migration for
 * databases that already exist in production.
 */

const MIGRATION_NAME = 'question_bank_soft_delete_hardening';

async function columnExists(mysqlPool, db, table, column) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, table, column]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function indexExists(mysqlPool, db, table, indexName) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [db, table, indexName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function constraintExists(mysqlPool, db, table, constraintName, type) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = ?`,
    [db, table, constraintName, type]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function tableExists(mysqlPool, db, table) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, table]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function ensureQuestionBankSoftDeleteSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };

  if (!(await tableExists(mysqlPool, db, 'question_bank'))) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'question_bank_missing' };
  }
  if (!(await tableExists(mysqlPool, db, 'users'))) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'users_missing' };
  }
  if (!(await columnExists(mysqlPool, db, 'question_bank', 'deleted_at'))) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'deleted_at_missing' };
  }

  const steps = [];

  if (!(await columnExists(mysqlPool, db, 'question_bank', 'deleted_by'))) {
    steps.push({
      name: 'add_deleted_by_column',
      sql: 'ALTER TABLE question_bank ADD COLUMN deleted_by BIGINT NULL AFTER deleted_at, ALGORITHM=INPLACE, LOCK=NONE',
    });
  }

  if (!(await indexExists(mysqlPool, db, 'question_bank', 'idx_qb_deleted_at'))) {
    steps.push({
      name: 'add_idx_qb_deleted_at',
      sql: 'ALTER TABLE question_bank ADD INDEX idx_qb_deleted_at (deleted_at), ALGORITHM=INPLACE, LOCK=NONE',
    });
  }

  if (!(await indexExists(mysqlPool, db, 'question_bank', 'idx_qb_active_list'))) {
    steps.push({
      name: 'add_idx_qb_active_list',
      sql: 'ALTER TABLE question_bank ADD INDEX idx_qb_active_list (deleted_at, course_id, id), ALGORITHM=INPLACE, LOCK=NONE',
    });
  }

  if (!(await constraintExists(mysqlPool, db, 'question_bank', 'fk_qb_deleted_by', 'FOREIGN KEY'))) {
    steps.push({
      name: 'add_fk_qb_deleted_by',
      sql: 'ALTER TABLE question_bank ADD CONSTRAINT fk_qb_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL',
    });
  }

  // MySQL 8 rejects CHECK on columns used in FK ON DELETE SET NULL — enforce actor in app layer.
  // Skip chk_qb_soft_delete_actor in automated Node migration.

  if (dryRun) {
    return { migration: MIGRATION_NAME, dryRun: true, steps };
  }

  const applied = [];
  for (const step of steps) {
    if (step.skipped) {
      applied.push(step);
      continue;
    }
    await mysqlPool.query(step.sql);
    applied.push({ name: step.name, applied: true });
    console.log(`[schema] ${MIGRATION_NAME}: ${step.name}`);
  }

  return { migration: MIGRATION_NAME, applied };
}

/**
 * Rollback helper — only when no deleted_by values exist.
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean, force?: boolean }} [opts]
 */
export async function rollbackQuestionBankSoftDeleteSchema(mysqlPool, { dryRun = false, force = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, rollback: true, skipped: true, reason: 'no_database' };

  const [[{ populated }]] = await mysqlPool.query(
    `SELECT COUNT(*) AS populated FROM question_bank WHERE deleted_by IS NOT NULL`
  );
  if (Number(populated) > 0 && !force) {
    throw new Error(
      `[schema] ${MIGRATION_NAME} rollback blocked: ${populated} row(s) have deleted_by set. Export audit data first.`
    );
  }

  const steps = [];
  if (await constraintExists(mysqlPool, db, 'question_bank', 'chk_qb_soft_delete_actor', 'CHECK')) {
    steps.push({ name: 'drop_chk', sql: 'ALTER TABLE question_bank DROP CHECK chk_qb_soft_delete_actor' });
  }
  if (await constraintExists(mysqlPool, db, 'question_bank', 'fk_qb_deleted_by', 'FOREIGN KEY')) {
    steps.push({ name: 'drop_fk', sql: 'ALTER TABLE question_bank DROP FOREIGN KEY fk_qb_deleted_by' });
  }
  if (await indexExists(mysqlPool, db, 'question_bank', 'idx_qb_active_list')) {
    steps.push({ name: 'drop_idx_active_list', sql: 'ALTER TABLE question_bank DROP INDEX idx_qb_active_list' });
  }
  if (await indexExists(mysqlPool, db, 'question_bank', 'idx_qb_deleted_at')) {
    steps.push({ name: 'drop_idx_deleted_at', sql: 'ALTER TABLE question_bank DROP INDEX idx_qb_deleted_at' });
  }
  if (await columnExists(mysqlPool, db, 'question_bank', 'deleted_by')) {
    steps.push({ name: 'drop_deleted_by', sql: 'ALTER TABLE question_bank DROP COLUMN deleted_by' });
  }

  if (dryRun) return { migration: MIGRATION_NAME, rollback: true, dryRun: true, steps };

  const applied = [];
  for (const step of steps) {
    await mysqlPool.query(step.sql);
    applied.push({ name: step.name, applied: true });
    console.log(`[schema] ${MIGRATION_NAME} rollback: ${step.name}`);
  }
  return { migration: MIGRATION_NAME, rollback: true, applied };
}
