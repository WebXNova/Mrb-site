-- Wizard / catalog: pricing visibility + subscription type (additive, idempotent).

ALTER TABLE course_pricing
  MODIFY COLUMN pricing_type ENUM('free', 'one_time', 'subscription') NOT NULL DEFAULT 'one_time';

SET @cp_enroll_vis = (
  SELECT COUNT(1) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'course_pricing' AND COLUMN_NAME = 'enrollment_visible'
);
SET @cp_enroll_vis_sql = IF(
  @cp_enroll_vis = 0,
  'ALTER TABLE course_pricing ADD COLUMN enrollment_visible TINYINT(1) NOT NULL DEFAULT 1 AFTER is_active',
  'SELECT 1'
);
PREPARE cp_enroll_vis_stmt FROM @cp_enroll_vis_sql;
EXECUTE cp_enroll_vis_stmt;
DEALLOCATE PREPARE cp_enroll_vis_stmt;

SET @cp_pub_vis = (
  SELECT COUNT(1) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'course_pricing' AND COLUMN_NAME = 'public_purchase_visible'
);
SET @cp_pub_vis_sql = IF(
  @cp_pub_vis = 0,
  'ALTER TABLE course_pricing ADD COLUMN public_purchase_visible TINYINT(1) NOT NULL DEFAULT 1 AFTER enrollment_visible',
  'SELECT 1'
);
PREPARE cp_pub_vis_stmt FROM @cp_pub_vis_sql;
EXECUTE cp_pub_vis_stmt;
DEALLOCATE PREPARE cp_pub_vis_stmt;
