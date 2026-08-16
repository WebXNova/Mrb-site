/**
 * Idempotent schema ensure — course_categories + course_category_map.
 */

const MIGRATION_NAME = 'course_categories';

async function tableExists(mysqlPool, db, tableName) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, tableName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function ensureCourseCategoriesSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };

  const categoriesExists = await tableExists(mysqlPool, db, 'course_categories');
  const mapExists = await tableExists(mysqlPool, db, 'course_category_map');
  if (categoriesExists && mapExists) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'tables_exist' };
  }

  const sql = `
CREATE TABLE IF NOT EXISTS course_categories (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(512) NULL,
  class_level ENUM('9th','10th','11th','12th','bachelor','o_level','a_level','entry_test','not_applicable') NOT NULL DEFAULT 'not_applicable',
  department ENUM('pre_medical','pre_engineering','commerce','computer_science','arts_humanities','general','entry_test_prep','ics','not_applicable') NOT NULL DEFAULT 'not_applicable',
  board ENUM('sindh_board','federal_board','punjab_board','kpk_board','balochistan_board','ajk_board','cambridge_o_level','cambridge_a_level','not_applicable') NOT NULL DEFAULT 'not_applicable',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 0,
  created_by BIGINT NOT NULL,
  updated_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_course_categories_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_course_categories_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_course_categories_name (name),
  KEY idx_course_categories_is_active (is_active),
  KEY idx_course_categories_display_order (display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_category_map (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  course_id BIGINT NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_course_category_map_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_course_category_map_category FOREIGN KEY (category_id) REFERENCES course_categories(id),
  UNIQUE KEY uq_course_category_map (course_id, category_id),
  KEY idx_course_category_map_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

  if (dryRun) {
    return { migration: MIGRATION_NAME, dryRun: true, sql };
  }

  for (const statement of sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)) {
    await mysqlPool.query(statement);
  }

  return { migration: MIGRATION_NAME, ok: true };
}
