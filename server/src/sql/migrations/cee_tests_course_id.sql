-- CEE: bind tests to courses (required for entitlement-scoped test access)
-- Run against production after backup.

SET @db := DATABASE();

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND COLUMN_NAME = 'course_id'
);

SET @sql_add := IF(
  @col_exists > 0,
  'SELECT 1',
  'ALTER TABLE tests ADD COLUMN course_id BIGINT NULL AFTER id'
);
PREPARE stmt FROM @sql_add;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND INDEX_NAME = 'idx_tests_course'
);
SET @sql_idx := IF(
  @idx_exists > 0,
  'SELECT 1',
  'ALTER TABLE tests ADD KEY idx_tests_course (course_id)'
);
PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;

-- FK added only when column exists and FK not present
SET @fk_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND CONSTRAINT_NAME = 'fk_tests_course'
);
SET @sql_fk := IF(
  @fk_exists > 0 OR @col_exists > 0 AND @col_exists = 0,
  'SELECT 1',
  IF(
    @col_exists = 0,
    'ALTER TABLE tests ADD CONSTRAINT fk_tests_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE',
    'SELECT 1'
  )
);
-- Simpler unconditional FK when column was just added:
SET @sql_fk2 := IF(
  @fk_exists > 0,
  'SELECT 1',
  'ALTER TABLE tests ADD CONSTRAINT fk_tests_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE'
);
PREPARE stmt_fk2 FROM @sql_fk2;
EXECUTE stmt_fk2;
DEALLOCATE PREPARE stmt_fk2;
