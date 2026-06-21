-- =============================================================================
-- Add SKIPPED status to question_import_batch_items (duplicate detection)
-- =============================================================================

SET @db := DATABASE();

SET @items_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_import_batch_items'
);

SET @sql_drop_check := IF(
  @items_tbl = 0,
  'SELECT ''SKIP: question_import_batch_items missing'' AS migration_skip',
  'ALTER TABLE question_import_batch_items DROP CHECK chk_import_item_status'
);

PREPARE stmt_drop FROM @sql_drop_check;
EXECUTE stmt_drop;
DEALLOCATE PREPARE stmt_drop;

SET @sql_add_check := IF(
  @items_tbl = 0,
  'SELECT ''SKIP: question_import_batch_items missing'' AS migration_skip',
  'ALTER TABLE question_import_batch_items ADD CONSTRAINT chk_import_item_status CHECK (status IN (''SUCCESS'', ''FAILED'', ''SKIPPED''))'
);

PREPARE stmt_add FROM @sql_add_check;
EXECUTE stmt_add;
DEALLOCATE PREPARE stmt_add;

SELECT 'question_import_batch_items SKIPPED status migration complete' AS migration_status;
