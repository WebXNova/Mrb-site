/**
 * Idempotent schema patch: question_bank / question_options rich HTML columns.
 */

const MIGRATION_NAME = 'question_bank_rich_html_columns';

async function columnExists(pool, db, tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, tableName, columnName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function tableExists(pool, db, tableName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, tableName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

const COLUMN_PATCHES = [
  {
    table: 'question_bank',
    column: 'question_html',
    ddl: 'ALTER TABLE question_bank ADD COLUMN question_html LONGTEXT NULL AFTER question_text',
  },
  {
    table: 'question_bank',
    column: 'explanation_html',
    ddl: 'ALTER TABLE question_bank ADD COLUMN explanation_html LONGTEXT NULL AFTER explanation',
  },
  {
    table: 'question_options',
    column: 'option_html',
    ddl: 'ALTER TABLE question_options ADD COLUMN option_html LONGTEXT NULL AFTER option_text',
  },
];

const BACKFILL_SQL = [
  `UPDATE question_bank
   SET question_html = question_text
   WHERE question_html IS NULL AND question_text IS NOT NULL AND TRIM(question_text) <> ''`,
  `UPDATE question_bank
   SET explanation_html = explanation
   WHERE explanation_html IS NULL AND explanation IS NOT NULL AND TRIM(explanation) <> ''`,
  `UPDATE question_options
   SET option_html = option_text
   WHERE option_html IS NULL AND option_text IS NOT NULL AND TRIM(option_text) <> ''`,
];

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function ensureQuestionBankRichHtmlSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };
  }

  if (!(await tableExists(mysqlPool, db, 'question_bank'))) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'question_bank_missing' };
  }

  const applied = [];

  for (const patch of COLUMN_PATCHES) {
    if (!(await tableExists(mysqlPool, db, patch.table))) {
      continue;
    }
    if (await columnExists(mysqlPool, db, patch.table, patch.column)) {
      continue;
    }
    if (dryRun) {
      applied.push({ table: patch.table, column: patch.column, action: 'add_column' });
      continue;
    }
    await mysqlPool.query(patch.ddl);
    applied.push({ table: patch.table, column: patch.column, action: 'added' });
    console.log(`[schema] Added ${patch.table}.${patch.column}`);
  }

  if (!dryRun && applied.length > 0) {
    for (const sql of BACKFILL_SQL) {
      await mysqlPool.query(sql);
    }
    console.log('[schema] Backfilled rich HTML columns from legacy text columns');
  }

  return {
    migration: MIGRATION_NAME,
    applied: applied.length > 0,
    columns: applied,
    dryRun,
  };
}
