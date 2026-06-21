/**
 * Ensures test_quiz_drafts exists (with soft-delete columns) on older databases.
 */

async function tableExists(pool, db, tableName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, tableName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function columnExists(pool, db, tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, tableName, columnName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function indexExists(pool, db, tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [db, tableName, indexName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function foreignKeyExists(pool, db, tableName, constraintName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [db, tableName, constraintName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

const CREATE_TEST_QUIZ_DRAFTS_SQL = `
CREATE TABLE IF NOT EXISTS test_quiz_drafts (
  draft_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  test_id BIGINT NOT NULL,
  draft_payload JSON NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by BIGINT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  deleted_by BIGINT NULL,
  materialized_version INT UNSIGNED NULL DEFAULT NULL,
  materialized_at TIMESTAMP NULL DEFAULT NULL,
  materialized_version INT UNSIGNED NULL DEFAULT NULL,
  materialized_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uq_test_quiz_drafts_test_id (test_id),
  KEY idx_test_quiz_drafts_created_by (created_by),
  KEY idx_test_quiz_drafts_updated_at (updated_at),
  KEY idx_test_quiz_drafts_deleted_at (deleted_at),
  CONSTRAINT fk_tqd_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_tqd_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tqd_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_tqd_version_positive CHECK (version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function ensureSoftDeleteColumns(pool, db) {
  if (!(await columnExists(pool, db, 'test_quiz_drafts', 'deleted_at'))) {
    await pool.query(
      'ALTER TABLE test_quiz_drafts ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at'
    );
    console.log('[schema] Added test_quiz_drafts.deleted_at');
  }

  if (!(await columnExists(pool, db, 'test_quiz_drafts', 'deleted_by'))) {
    await pool.query(
      'ALTER TABLE test_quiz_drafts ADD COLUMN deleted_by BIGINT NULL AFTER deleted_at'
    );
    console.log('[schema] Added test_quiz_drafts.deleted_by');
  }

  if (!(await indexExists(pool, db, 'test_quiz_drafts', 'idx_test_quiz_drafts_deleted_at'))) {
    await pool.query(
      'ALTER TABLE test_quiz_drafts ADD KEY idx_test_quiz_drafts_deleted_at (deleted_at)'
    );
    console.log('[schema] Added test_quiz_drafts.idx_test_quiz_drafts_deleted_at');
  }

  if (!(await foreignKeyExists(pool, db, 'test_quiz_drafts', 'fk_tqd_deleted_by'))) {
    try {
      await pool.query(
        'ALTER TABLE test_quiz_drafts ADD CONSTRAINT fk_tqd_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL'
      );
      console.log('[schema] Added test_quiz_drafts.fk_tqd_deleted_by');
    } catch (error) {
      console.warn('[schema] Could not add fk_tqd_deleted_by:', error.message);
    }
  }
}

async function ensureMaterializationColumns(pool, db) {
  if (!(await columnExists(pool, db, 'test_quiz_drafts', 'materialized_version'))) {
    await pool.query(
      'ALTER TABLE test_quiz_drafts ADD COLUMN materialized_version INT UNSIGNED NULL DEFAULT NULL AFTER deleted_by'
    );
    console.log('[schema] Added test_quiz_drafts.materialized_version');
  }

  if (!(await columnExists(pool, db, 'test_quiz_drafts', 'materialized_at'))) {
    await pool.query(
      'ALTER TABLE test_quiz_drafts ADD COLUMN materialized_at TIMESTAMP NULL DEFAULT NULL AFTER materialized_version'
    );
    console.log('[schema] Added test_quiz_drafts.materialized_at');
  }
}

export async function ensureTestQuizDraftsSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  if (!(await tableExists(mysqlPool, db, 'tests'))) return;
  if (!(await tableExists(mysqlPool, db, 'users'))) return;

  if (!(await tableExists(mysqlPool, db, 'test_quiz_drafts'))) {
    await mysqlPool.query(CREATE_TEST_QUIZ_DRAFTS_SQL);
    console.log('[schema] Created test_quiz_drafts');
    return;
  }

  await ensureSoftDeleteColumns(mysqlPool, db);
  await ensureMaterializationColumns(mysqlPool, db);
}
