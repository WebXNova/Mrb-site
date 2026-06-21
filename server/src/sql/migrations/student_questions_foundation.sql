-- =============================================================================
-- MRB LMS — student_questions foundation (relational course/subject/teacher)
-- =============================================================================
-- ADDITIVE ONLY | IDEMPOTENT | Node bootstrap: ensureStudentQuestionsFoundationSchema.js
-- =============================================================================

SET @db := DATABASE();

SET @tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions'
);

SELECT IF(@tbl = 0, 'SKIP: student_questions missing', 'OK: student_questions exists') AS preflight;

SET @sql_course := IF(
  @tbl = 0,
  'SELECT ''SKIP'' AS migration_skip',
  IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = ''student_questions'' AND COLUMN_NAME = ''course_id'') > 0,
    'SELECT ''SKIP course_id'' AS migration_skip',
    'ALTER TABLE student_questions ADD COLUMN course_id BIGINT NULL AFTER user_id'
  )
);
PREPARE s1 FROM @sql_course; EXECUTE s1; DEALLOCATE PREPARE s1;

SET @sql_subject := IF(
  @tbl = 0,
  'SELECT ''SKIP'' AS migration_skip',
  IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = ''student_questions'' AND COLUMN_NAME = ''subject_id'') > 0,
    'SELECT ''SKIP subject_id'' AS migration_skip',
    'ALTER TABLE student_questions ADD COLUMN subject_id BIGINT NULL AFTER course_id'
  )
);
PREPARE s2 FROM @sql_subject; EXECUTE s2; DEALLOCATE PREPARE s2;

SET @sql_teacher := IF(
  @tbl = 0,
  'SELECT ''SKIP'' AS migration_skip',
  IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = ''student_questions'' AND COLUMN_NAME = ''assigned_teacher_id'') > 0,
    'SELECT ''SKIP assigned_teacher_id'' AS migration_skip',
    'ALTER TABLE student_questions ADD COLUMN assigned_teacher_id BIGINT NULL AFTER subject_id'
  )
);
PREPARE s3 FROM @sql_teacher; EXECUTE s3; DEALLOCATE PREPARE s3;

SET @sql_seen := IF(
  @tbl = 0,
  'SELECT ''SKIP'' AS migration_skip',
  IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = ''student_questions'' AND COLUMN_NAME = ''seen_at'') > 0,
    'SELECT ''SKIP seen_at'' AS migration_skip',
    'ALTER TABLE student_questions ADD COLUMN seen_at TIMESTAMP NULL AFTER status'
  )
);
PREPARE s4 FROM @sql_seen; EXECUTE s4; DEALLOCATE PREPARE s4;
