/**
 * Idempotent ALTER — course_categories class_level, department, board columns.
 */

const MIGRATION_NAME = 'course_categories_metadata';

const COLUMNS = [
  {
    name: 'class_level',
    ddl: `class_level ENUM('9th','10th','11th','12th','bachelor','o_level','a_level','entry_test','not_applicable') NOT NULL DEFAULT 'not_applicable' AFTER description`,
  },
  {
    name: 'department',
    ddl: `department ENUM('pre_medical','pre_engineering','commerce','computer_science','arts_humanities','general','entry_test_prep','ics','not_applicable') NOT NULL DEFAULT 'not_applicable' AFTER class_level`,
  },
  {
    name: 'board',
    ddl: `board ENUM('sindh_board','federal_board','punjab_board','kpk_board','balochistan_board','ajk_board','cambridge_o_level','cambridge_a_level','not_applicable') NOT NULL DEFAULT 'not_applicable' AFTER department`,
  },
];

async function columnExists(mysqlPool, db, columnName) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'course_categories' AND COLUMN_NAME = ?`,
    [db, columnName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function ensureCourseCategoryMetadataSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };

  const pending = [];
  for (const col of COLUMNS) {
    if (!(await columnExists(mysqlPool, db, col.name))) {
      pending.push(col);
    }
  }

  if (!pending.length) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'columns_exist' };
  }

  const statements = pending.map((col) => `ALTER TABLE course_categories ADD COLUMN ${col.ddl}`);

  if (dryRun) {
    return { migration: MIGRATION_NAME, dryRun: true, sql: statements.join(';\n') };
  }

  for (const statement of statements) {
    await mysqlPool.query(statement);
  }

  return { migration: MIGRATION_NAME, ok: true, added: pending.map((c) => c.name) };
}
