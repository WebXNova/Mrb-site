/**
 * Ensures `course_field_mappings` table exists for configurable cross-course field mapping.
 */

const MIGRATION_NAME = 'course_field_mappings';

async function tableExists(pool, db, table) {
  const [rows] = await pool.query(
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     LIMIT 1`,
    [db, table]
  );
  return rows.length > 0;
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function ensureCourseFieldMappingsSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };

  if (await tableExists(mysqlPool, db, 'course_field_mappings')) {
    return { migration: MIGRATION_NAME, steps: [] };
  }

  const step = {
    name: 'create_course_field_mappings',
    sql: `CREATE TABLE IF NOT EXISTS course_field_mappings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_course_id BIGINT NULL,
  target_course_id BIGINT NULL,
  source_field VARCHAR(80) NOT NULL,
  target_field VARCHAR(80) NOT NULL,
  value_map_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_course_field_mapping (source_course_id, target_course_id, source_field, target_field),
  KEY idx_course_field_mappings_target (target_course_id, is_active),
  CONSTRAINT fk_cfm_source_course FOREIGN KEY (source_course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_cfm_target_course FOREIGN KEY (target_course_id) REFERENCES courses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  };

  if (dryRun) {
    return { migration: MIGRATION_NAME, dryRun: true, steps: [step] };
  }

  console.log(`[schema] ${MIGRATION_NAME}: creating course_field_mappings table`);
  await mysqlPool.query(step.sql);
  console.log(`[schema] ${MIGRATION_NAME}: course_field_mappings ready`);

  return { migration: MIGRATION_NAME, steps: [{ name: step.name, ok: true }] };
}
