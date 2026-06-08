-- P2 PATCH-6: Drop legacy tests.subject VARCHAR after test_subjects backfill.
-- Run audit-test-subject-legacy.mjs first; resolve mismatches before applying.

SET @db := DATABASE();

SET @tests_subject_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND COLUMN_NAME = 'subject'
);

SET @sql_drop_tests_subject := IF(
  @tests_subject_col = 0,
  'SELECT 1',
  'ALTER TABLE tests DROP COLUMN subject'
);

PREPARE stmt_drop_tests_subject FROM @sql_drop_tests_subject;
EXECUTE stmt_drop_tests_subject;
DEALLOCATE PREPARE stmt_drop_tests_subject;
