-- Rollback — idx_processed_webhooks_created_at

SET @db := DATABASE();

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'processed_webhooks'
    AND INDEX_NAME = 'idx_processed_webhooks_created_at'
);

SET @sql_drop_idx := IF(
  @idx_exists = 0,
  'SELECT 1',
  'ALTER TABLE processed_webhooks DROP INDEX idx_processed_webhooks_created_at'
);

PREPARE stmt_drop_idx FROM @sql_drop_idx;
EXECUTE stmt_drop_idx;
DEALLOCATE PREPARE stmt_drop_idx;
