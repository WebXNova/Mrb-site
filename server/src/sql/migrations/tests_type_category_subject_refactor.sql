-- Tests: drop sub_category, default category MDCAT, test_type subject_wise|mixed_subject, test_subjects junction.
-- Safe to re-run (idempotent checks).

SET @db := DATABASE();

UPDATE tests SET category = 'MDCAT' WHERE category IS NULL OR TRIM(category) = '';

UPDATE tests
SET test_type = 'mixed_subject'
WHERE test_type IS NULL
   OR TRIM(test_type) = ''
   OR test_type NOT IN ('subject_wise', 'mixed_subject');

SET @sub_cat_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND COLUMN_NAME = 'sub_category'
);
SET @sql_drop_sub_cat := IF(
  @sub_cat_col = 0,
  'SELECT 1',
  'ALTER TABLE tests DROP COLUMN sub_category'
);
PREPARE stmt_drop_sub_cat FROM @sql_drop_sub_cat;
EXECUTE stmt_drop_sub_cat;
DEALLOCATE PREPARE stmt_drop_sub_cat;

SET @tests_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests'
);
SET @sql_modify_category := IF(
  @tests_tbl = 0,
  'SELECT 1',
  'ALTER TABLE tests MODIFY COLUMN category VARCHAR(80) NOT NULL DEFAULT ''MDCAT'''
);
PREPARE stmt_modify_category FROM @sql_modify_category;
EXECUTE stmt_modify_category;
DEALLOCATE PREPARE stmt_modify_category;

SET @sql_modify_test_type := IF(
  @tests_tbl = 0,
  'SELECT 1',
  'ALTER TABLE tests MODIFY COLUMN test_type VARCHAR(50) NOT NULL DEFAULT ''subject_wise'''
);
PREPARE stmt_modify_test_type FROM @sql_modify_test_type;
EXECUTE stmt_modify_test_type;
DEALLOCATE PREPARE stmt_modify_test_type;

CREATE TABLE IF NOT EXISTS test_subjects (
  test_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (test_id, subject_id),
  KEY idx_test_subjects_subject (subject_id),
  CONSTRAINT fk_test_subjects_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_test_subjects_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill test_subjects from legacy tests.subject text when title matches course subject
INSERT IGNORE INTO test_subjects (test_id, subject_id)
SELECT t.id, s.id
FROM tests t
INNER JOIN subjects s
  ON s.course_id = t.course_id
 AND s.is_active = TRUE
 AND LOWER(TRIM(s.title)) = LOWER(TRIM(t.subject))
WHERE t.deleted_at IS NULL
  AND t.subject IS NOT NULL
  AND TRIM(t.subject) <> ''
  AND NOT EXISTS (SELECT 1 FROM test_subjects ts WHERE ts.test_id = t.id);

UPDATE tests t
INNER JOIN (
  SELECT test_id, COUNT(*) AS cnt FROM test_subjects GROUP BY test_id
) ts ON ts.test_id = t.id
SET t.test_type = 'subject_wise'
WHERE t.deleted_at IS NULL
  AND ts.cnt = 1
  AND t.test_type = 'mixed_subject';
