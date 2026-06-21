-- =============================================================================
-- MRB LMS — teacher_subjects rollback (drops table + trigger; irreversible data loss)
-- =============================================================================
-- Run only when intentionally removing teacher-subject assignment persistence.
--   mysql -u USER -p DATABASE_NAME < teacher_subjects_rollback.sql
-- =============================================================================

SET @db := DATABASE();

DROP TRIGGER IF EXISTS trg_teacher_subjects_teacher_role_before_insert;

SET @teacher_subjects_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'teacher_subjects'
);

SET @sql_drop_teacher_subjects := IF(
  @teacher_subjects_tbl = 0,
  'SELECT ''SKIP: teacher_subjects does not exist'' AS rollback_skip',
  'DROP TABLE teacher_subjects'
);

PREPARE stmt_drop_teacher_subjects FROM @sql_drop_teacher_subjects;
EXECUTE stmt_drop_teacher_subjects;
DEALLOCATE PREPARE stmt_drop_teacher_subjects;
