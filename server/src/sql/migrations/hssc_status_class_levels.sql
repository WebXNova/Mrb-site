-- =============================================================================
-- MRB LMS — enrollments.hssc_status: class-level options (9th–12th, Bachelor)
-- =============================================================================
-- Replaces legacy Inter Class / First Year Class / Matric Class values.
-- Rollback: hssc_status_class_levels_rollback.sql
-- =============================================================================

SET @db := DATABASE();

SET @enrollments_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'enrollments'
);

SET @hssc_col := (
  SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'enrollments' AND COLUMN_NAME = 'hssc_status'
  LIMIT 1
);

SELECT IF(@enrollments_tbl = 0, 'FAIL: enrollments table missing', 'OK: enrollments exists') AS preflight_enrollments;

SET @sql_widen_hssc := IF(
  @enrollments_tbl = 0,
  'SELECT ''SKIP: enrollments table missing'' AS migration_skip',
  IF(
    @hssc_col LIKE '%''9th''%',
    'SELECT ''SKIP: hssc_status already migrated'' AS migration_skip',
    'ALTER TABLE enrollments MODIFY COLUMN hssc_status ENUM(''Inter Class'', ''First Year Class'', ''Matric Class'', ''9th'', ''10th'', ''11th'', ''12th'', ''Bachelor'') NOT NULL'
  )
);

PREPARE stmt_widen FROM @sql_widen_hssc;
EXECUTE stmt_widen;
DEALLOCATE PREPARE stmt_widen;

SET @already_migrated := (
  SELECT IF(@hssc_col LIKE '%''9th''%' AND @hssc_col NOT LIKE '%Inter Class%', 1, 0)
);

UPDATE enrollments SET hssc_status = '11th' WHERE hssc_status = 'Inter Class' AND @already_migrated = 0;
UPDATE enrollments SET hssc_status = '11th' WHERE hssc_status = 'First Year Class' AND @already_migrated = 0;
UPDATE enrollments SET hssc_status = '10th' WHERE hssc_status = 'Matric Class' AND @already_migrated = 0;

SET @sql_finalize_hssc := IF(
  @enrollments_tbl = 0 OR @already_migrated = 1,
  'SELECT ''SKIP: finalize hssc_status'' AS migration_skip',
  'ALTER TABLE enrollments MODIFY COLUMN hssc_status ENUM(''9th'', ''10th'', ''11th'', ''12th'', ''Bachelor'') NOT NULL'
);

PREPARE stmt_finalize FROM @sql_finalize_hssc;
EXECUTE stmt_finalize;
DEALLOCATE PREPARE stmt_finalize;

SELECT COLUMN_TYPE AS hssc_status_column_type
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'enrollments' AND COLUMN_NAME = 'hssc_status'
LIMIT 1;
