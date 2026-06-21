-- =============================================================================
-- Rollback: question_import_batch_items
-- =============================================================================
-- Drops audit linkage table only. Does NOT remove question_import_batches or
-- question_bank rows. Historical batch counters remain (backward compatible).
-- =============================================================================

SET @db := DATABASE();

SET @items_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_import_batch_items'
);

SET @sql_drop := IF(
  @items_tbl = 0,
  'SELECT ''SKIP: question_import_batch_items does not exist'' AS rollback_skip',
  'DROP TABLE question_import_batch_items'
);

PREPARE stmt FROM @sql_drop;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'question_import_batch_items rollback complete' AS rollback_status;
