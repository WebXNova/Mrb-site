-- =============================================================================
-- MRB LMS — processed_webhooks created_at index (retention cleanup)
-- =============================================================================
-- Supports batched DELETE WHERE created_at < cutoff without full table scans.
--
-- Rollback: processed_webhooks_created_at_index_rollback.sql
-- =============================================================================

SET @db := DATABASE();

SET @tbl_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'processed_webhooks'
);

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'processed_webhooks'
    AND INDEX_NAME = 'idx_processed_webhooks_created_at'
);

SET @sql_add_idx := IF(
  @tbl_exists = 0 OR @idx_exists > 0,
  'SELECT 1',
  'ALTER TABLE processed_webhooks ADD KEY idx_processed_webhooks_created_at (created_at)'
);

PREPARE stmt_add_idx FROM @sql_add_idx;
EXECUTE stmt_add_idx;
DEALLOCATE PREPARE stmt_add_idx;
