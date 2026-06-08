-- P2 PATCH-7: Normalize tests enum columns then add CHECK constraints (idempotent).
-- Run audit-test-enum-values.mjs before applying in production.

SET @db := DATABASE();

SET @tests_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests'
);

-- Phase A: normalize invalid rows (no silent coercion in app — explicit SQL fix)
SET @sql_norm_category := IF(
  @tests_tbl = 0,
  'SELECT 1',
  'UPDATE tests SET category = ''MDCAT'' WHERE category IS NULL OR TRIM(category) = '''' OR category <> ''MDCAT'''
);
PREPARE stmt_norm_category FROM @sql_norm_category;
EXECUTE stmt_norm_category;
DEALLOCATE PREPARE stmt_norm_category;

SET @sql_norm_type := IF(
  @tests_tbl = 0,
  'SELECT 1',
  'UPDATE tests SET test_type = ''mixed_subject'' WHERE test_type IS NULL OR TRIM(test_type) = '''' OR test_type NOT IN (''subject_wise'', ''mixed_subject'')'
);
PREPARE stmt_norm_type FROM @sql_norm_type;
EXECUTE stmt_norm_type;
DEALLOCATE PREPARE stmt_norm_type;

SET @sql_norm_status := IF(
  @tests_tbl = 0,
  'SELECT 1',
  'UPDATE tests SET status = ''published'' WHERE UPPER(TRIM(status)) = ''PUBLISHED'''
);
PREPARE stmt_norm_status_pub FROM @sql_norm_status;
EXECUTE stmt_norm_status_pub;
DEALLOCATE PREPARE stmt_norm_status_pub;

SET @sql_norm_status_draft := IF(
  @tests_tbl = 0,
  'SELECT 1',
  'UPDATE tests SET status = ''DRAFT'' WHERE LOWER(TRIM(status)) = ''draft'' AND status <> ''published'''
);
PREPARE stmt_norm_status_draft FROM @sql_norm_status_draft;
EXECUTE stmt_norm_status_draft;
DEALLOCATE PREPARE stmt_norm_status_draft;

SET @sql_norm_status_default := IF(
  @tests_tbl = 0,
  'SELECT 1',
  'UPDATE tests SET status = ''INCOMPLETE'' WHERE status IS NULL OR TRIM(status) = '''' OR status NOT IN (''INCOMPLETE'', ''DRAFT'', ''READY_FOR_PUBLISH'', ''published'')'
);
PREPARE stmt_norm_status_default FROM @sql_norm_status_default;
EXECUTE stmt_norm_status_default;
DEALLOCATE PREPARE stmt_norm_status_default;

-- Phase B: invalid row counts (abort CHECK if any remain)
SET @invalid_type := (
  SELECT COUNT(*) FROM tests
  WHERE deleted_at IS NULL AND test_type NOT IN ('subject_wise', 'mixed_subject')
);
SET @invalid_category := (
  SELECT COUNT(*) FROM tests
  WHERE deleted_at IS NULL AND category <> 'MDCAT'
);
SET @invalid_status := (
  SELECT COUNT(*) FROM tests
  WHERE deleted_at IS NULL
    AND status NOT IN ('INCOMPLETE', 'DRAFT', 'READY_FOR_PUBLISH', 'published')
);

-- Phase C: CHECK constraints (skip when invalid rows exist)
SET @chk_type_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND CONSTRAINT_NAME = 'chk_tests_test_type' AND CONSTRAINT_TYPE = 'CHECK'
);

SET @sql_add_chk_type := IF(
  @tests_tbl = 0 OR @invalid_type > 0 OR @invalid_category > 0 OR @invalid_status > 0,
  'SELECT 1',
  IF(
    @chk_type_exists > 0,
    'SELECT ''SKIP: chk_tests_test_type exists'' AS migration_skip',
    'ALTER TABLE tests ADD CONSTRAINT chk_tests_test_type CHECK (test_type IN (''subject_wise'', ''mixed_subject''))'
  )
);
PREPARE stmt_chk_type FROM @sql_add_chk_type;
EXECUTE stmt_chk_type;
DEALLOCATE PREPARE stmt_chk_type;

SET @chk_category_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND CONSTRAINT_NAME = 'chk_tests_category' AND CONSTRAINT_TYPE = 'CHECK'
);

SET @sql_add_chk_category := IF(
  @tests_tbl = 0 OR @invalid_type > 0 OR @invalid_category > 0 OR @invalid_status > 0,
  'SELECT 1',
  IF(
    @chk_category_exists > 0,
    'SELECT ''SKIP: chk_tests_category exists'' AS migration_skip',
    'ALTER TABLE tests ADD CONSTRAINT chk_tests_category CHECK (category = ''MDCAT'')'
  )
);
PREPARE stmt_chk_category FROM @sql_add_chk_category;
EXECUTE stmt_chk_category;
DEALLOCATE PREPARE stmt_chk_category;

SET @chk_status_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND CONSTRAINT_NAME = 'chk_tests_status' AND CONSTRAINT_TYPE = 'CHECK'
);

SET @sql_add_chk_status := IF(
  @tests_tbl = 0 OR @invalid_type > 0 OR @invalid_category > 0 OR @invalid_status > 0,
  'SELECT 1',
  IF(
    @chk_status_exists > 0,
    'SELECT ''SKIP: chk_tests_status exists'' AS migration_skip',
    'ALTER TABLE tests ADD CONSTRAINT chk_tests_status CHECK (status IN (''INCOMPLETE'', ''DRAFT'', ''READY_FOR_PUBLISH'', ''published''))'
  )
);
PREPARE stmt_chk_status FROM @sql_add_chk_status;
EXECUTE stmt_chk_status;
DEALLOCATE PREPARE stmt_chk_status;
