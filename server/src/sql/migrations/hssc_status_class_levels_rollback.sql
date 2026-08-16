-- Rollback: restore legacy hssc_status enum (best-effort reverse mapping).
-- =============================================================================

SET @db := DATABASE();

SET @enrollments_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'enrollments'
);

UPDATE enrollments SET hssc_status = 'Inter Class' WHERE hssc_status IN ('11th', '12th');
UPDATE enrollments SET hssc_status = 'First Year Class' WHERE hssc_status = '9th';
UPDATE enrollments SET hssc_status = 'Matric Class' WHERE hssc_status IN ('10th', 'Bachelor');

SET @sql_rollback := IF(
  @enrollments_tbl = 0,
  'SELECT ''SKIP: enrollments table missing'' AS rollback_skip',
  'ALTER TABLE enrollments MODIFY COLUMN hssc_status ENUM(''Inter Class'', ''First Year Class'', ''Matric Class'') NOT NULL'
);

PREPARE stmt FROM @sql_rollback;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
