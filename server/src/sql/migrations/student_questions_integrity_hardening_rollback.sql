-- =============================================================================
-- MRB LMS — student_questions integrity hardening ROLLBACK
-- =============================================================================
-- Removes constraints/triggers added by student_questions_integrity_hardening.sql.
-- Does NOT drop legacy indexes that pre-dated the migration (e.g. idx_student_questions_user_created).
-- Does NOT restore cleaned-up orphan data — restore from mysqldump if needed.
-- =============================================================================

SET @db := DATABASE();

DROP TRIGGER IF EXISTS trg_sq_assigned_teacher_role_before_insert;
DROP TRIGGER IF EXISTS trg_sq_assigned_teacher_role_before_update;

-- Foreign keys (new names only — leave legacy fk_student_questions_* if present)
SET @fk_sq_user := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions' AND CONSTRAINT_NAME = 'fk_sq_user_id'
);
SET @sql_drop_fk_user := IF(@fk_sq_user = 0, 'SELECT 1', 'ALTER TABLE student_questions DROP FOREIGN KEY fk_sq_user_id');
PREPARE s1 FROM @sql_drop_fk_user; EXECUTE s1; DEALLOCATE PREPARE s1;

SET @fk_sq_course := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions' AND CONSTRAINT_NAME = 'fk_sq_course_id'
);
SET @sql_drop_fk_course := IF(@fk_sq_course = 0, 'SELECT 1', 'ALTER TABLE student_questions DROP FOREIGN KEY fk_sq_course_id');
PREPARE s2 FROM @sql_drop_fk_course; EXECUTE s2; DEALLOCATE PREPARE s2;

SET @fk_sq_subject := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions' AND CONSTRAINT_NAME = 'fk_sq_subject_id'
);
SET @sql_drop_fk_subject := IF(@fk_sq_subject = 0, 'SELECT 1', 'ALTER TABLE student_questions DROP FOREIGN KEY fk_sq_subject_id');
PREPARE s3 FROM @sql_drop_fk_subject; EXECUTE s3; DEALLOCATE PREPARE s3;

SET @fk_sq_teacher := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions' AND CONSTRAINT_NAME = 'fk_sq_assigned_teacher_id'
);
SET @sql_drop_fk_teacher := IF(@fk_sq_teacher = 0, 'SELECT 1', 'ALTER TABLE student_questions DROP FOREIGN KEY fk_sq_assigned_teacher_id');
PREPARE s4 FROM @sql_drop_fk_teacher; EXECUTE s4; DEALLOCATE PREPARE s4;

SET @fk_sq_answered := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions' AND CONSTRAINT_NAME = 'fk_sq_answered_by'
);
SET @sql_drop_fk_answered := IF(@fk_sq_answered = 0, 'SELECT 1', 'ALTER TABLE student_questions DROP FOREIGN KEY fk_sq_answered_by');
PREPARE s5 FROM @sql_drop_fk_answered; EXECUTE s5; DEALLOCATE PREPARE s5;

-- Indexes added by hardening migration (safe to drop if present)
SET @drop_idx_names := 'idx_sq_user_id,idx_sq_status,idx_sq_created_at,idx_sq_updated_at,idx_sq_course_id,idx_sq_subject_id,idx_sq_assigned_teacher_id';

-- Drop each index idempotently
DROP PROCEDURE IF EXISTS sp_sq_rollback_drop_indexes;

DELIMITER $$

CREATE PROCEDURE sp_sq_rollback_drop_indexes()
BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE idx_name VARCHAR(64);
  DECLARE cur CURSOR FOR
    SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_questions'
      AND INDEX_NAME IN (
        'idx_sq_user_id','idx_sq_status','idx_sq_created_at','idx_sq_updated_at',
        'idx_sq_course_id','idx_sq_subject_id','idx_sq_assigned_teacher_id'
      )
    GROUP BY INDEX_NAME;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO idx_name;
    IF done THEN LEAVE read_loop; END IF;
    SET @ddl = CONCAT('ALTER TABLE student_questions DROP INDEX `', idx_name, '`');
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END LOOP;
  CLOSE cur;
END$$

DELIMITER ;

CALL sp_sq_rollback_drop_indexes();
DROP PROCEDURE IF EXISTS sp_sq_rollback_drop_indexes;

SELECT 'student_questions_integrity_hardening rollback complete' AS status;
