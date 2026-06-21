-- Teacher thread ref index for O(1) thread resolution (additive, idempotent).
-- Node bootstrap: ensureStudentQuestionsFoundationSchema.js

SET @db := DATABASE();

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions' AND COLUMN_NAME = 'teacher_thread_ref'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE student_questions ADD COLUMN teacher_thread_ref VARCHAR(22) NULL, ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''SKIP teacher_thread_ref column'' AS step'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions' AND INDEX_NAME = 'idx_sq_teacher_thread_ref'
);

SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE student_questions ADD INDEX idx_sq_teacher_thread_ref (assigned_teacher_id, teacher_thread_ref), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''SKIP idx_sq_teacher_thread_ref'' AS step'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions' AND INDEX_NAME = 'idx_sq_teacher_user_updated'
);

SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE student_questions ADD INDEX idx_sq_teacher_user_updated (assigned_teacher_id, user_id, updated_at), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''SKIP idx_sq_teacher_user_updated'' AS step'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
