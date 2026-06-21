-- =============================================================================
-- MRB LMS — question_import_batch_items (per-question import audit trail)
-- =============================================================================
-- PRODUCTION-CRITICAL | ADDITIVE ONLY | IDEMPOTENT | ZERO DATA LOSS
--
-- Links each Aiken import batch to individual question outcomes (success/fail).
-- Enables batch history, support investigations, and rollback analysis.
--
-- Rollback companion: question_import_batch_items_rollback.sql
-- Node bootstrap:      src/db/ensureQuestionImportBatchItemsSchema.js
--
-- Run:
--   mysql -u USER -p DATABASE_NAME < question_import_batch_items.sql
-- =============================================================================

SET @db := DATABASE();

SET @batches_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_import_batches'
);

SET @bank_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_bank'
);

SET @items_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_import_batch_items'
);

SELECT IF(@batches_tbl = 0, 'FAIL: question_import_batches missing', 'OK: batches exists') AS preflight_batches;
SELECT IF(@bank_tbl = 0, 'FAIL: question_bank missing', 'OK: question_bank exists') AS preflight_bank;

SET @sql_create_items := IF(
  @batches_tbl = 0 OR @bank_tbl = 0,
  'SELECT ''SKIP: prerequisite tables missing'' AS migration_skip',
  IF(
    @items_tbl > 0,
    'SELECT ''SKIP: question_import_batch_items already exists'' AS migration_skip',
    'CREATE TABLE question_import_batch_items (
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
      CONSTRAINT chk_import_item_status CHECK (status IN (''SUCCESS'', ''FAILED''))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
  )
);

PREPARE stmt FROM @sql_create_items;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'question_import_batch_items migration complete' AS migration_status;
