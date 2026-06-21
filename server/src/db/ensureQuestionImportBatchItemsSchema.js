/**
 * Idempotent schema patch: question_import_batch_items audit linkage table.
 */

const MIGRATION_NAME = 'question_import_batch_items';

async function tableExists(pool, db, tableName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, tableName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function checkConstraintAllowsSkipped(pool, db) {
  const [rows] = await pool.query(
    `SELECT CHECK_CLAUSE
     FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME = 'chk_import_item_status'`,
    [db]
  );
  const clause = String(rows[0]?.CHECK_CLAUSE ?? '');
  return clause.includes('SKIPPED');
}

const CREATE_ITEMS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS question_import_batch_items (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id BIGINT NOT NULL,
  question_number INT NOT NULL,
  question_title VARCHAR(500) NULL,
  question_id BIGINT NULL,
  status VARCHAR(20) NOT NULL,
  error_code VARCHAR(100) NULL,
  error_message VARCHAR(1000) NULL,
  validation_layer VARCHAR(50) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_import_batch_question (batch_id, question_number),
  KEY idx_import_items_batch (batch_id),
  KEY idx_import_items_question (question_id),
  KEY idx_import_items_status (batch_id, status),
  KEY idx_import_items_created (created_at),
  CONSTRAINT fk_import_items_batch FOREIGN KEY (batch_id) REFERENCES question_import_batches(id) ON DELETE CASCADE,
  CONSTRAINT fk_import_items_question FOREIGN KEY (question_id) REFERENCES question_bank(id) ON DELETE SET NULL,
  CONSTRAINT chk_import_item_status CHECK (status IN ('SUCCESS', 'FAILED', 'SKIPPED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function ensureSkippedStatusConstraint(pool, db) {
  if (await checkConstraintAllowsSkipped(pool, db)) {
    return { patched: false, reason: 'skipped_status_present' };
  }

  try {
    await pool.query('ALTER TABLE question_import_batch_items DROP CHECK chk_import_item_status');
  } catch (error) {
    console.warn('[schema] DROP CHECK chk_import_item_status:', error.message);
  }

  await pool.query(
    `ALTER TABLE question_import_batch_items
     ADD CONSTRAINT chk_import_item_status
     CHECK (status IN ('SUCCESS', 'FAILED', 'SKIPPED'))`
  );
  console.log('[schema] Updated question_import_batch_items.chk_import_item_status for SKIPPED');
  return { patched: true };
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function ensureQuestionImportBatchItemsSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };
  }

  if (!(await tableExists(mysqlPool, db, 'question_import_batches'))) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'question_import_batches_missing' };
  }

  if (!(await tableExists(mysqlPool, db, 'question_bank'))) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'question_bank_missing' };
  }

  if (!(await tableExists(mysqlPool, db, 'question_import_batch_items'))) {
    if (dryRun) {
      return { migration: MIGRATION_NAME, dryRun: true, action: 'create_question_import_batch_items' };
    }
    await mysqlPool.query(CREATE_ITEMS_TABLE_SQL);
    console.log('[schema] Created question_import_batch_items');
    return { migration: MIGRATION_NAME, applied: true, action: 'created' };
  }

  if (dryRun) {
    const allowsSkipped = await checkConstraintAllowsSkipped(mysqlPool, db);
    return {
      migration: MIGRATION_NAME,
      dryRun: true,
      action: allowsSkipped ? 'noop' : 'patch_skipped_status',
    };
  }

  const patch = await ensureSkippedStatusConstraint(mysqlPool, db);
  return { migration: MIGRATION_NAME, applied: patch.patched, action: 'patch_skipped_status', ...patch };
}
