/**
 * Ensures contact_remarks has whatsapp + posted columns on existing databases.
 */

async function columnExists(pool, db, tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, tableName, columnName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function indexExists(pool, db, tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [db, tableName, indexName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function ensureContactRemarksPostedSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  const [tableRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'contact_remarks'`,
    [db]
  );
  if (Number(tableRows[0]?.n ?? 0) === 0) {
    console.warn('[schema] contact_remarks posted columns skipped — table missing');
    return;
  }

  if (!(await columnExists(mysqlPool, db, 'contact_remarks', 'whatsapp'))) {
    await mysqlPool.query(`ALTER TABLE contact_remarks ADD COLUMN whatsapp VARCHAR(20) NULL AFTER email`);
    console.log('[schema] Added contact_remarks.whatsapp');
  }

  if (!(await columnExists(mysqlPool, db, 'contact_remarks', 'posted'))) {
    await mysqlPool.query(
      `ALTER TABLE contact_remarks ADD COLUMN posted TINYINT(1) NOT NULL DEFAULT 0 AFTER status`
    );
    console.log('[schema] Added contact_remarks.posted');
  }

  if (!(await columnExists(mysqlPool, db, 'contact_remarks', 'posted_at'))) {
    await mysqlPool.query(`ALTER TABLE contact_remarks ADD COLUMN posted_at TIMESTAMP NULL AFTER posted`);
    console.log('[schema] Added contact_remarks.posted_at');
  }

  if (!(await indexExists(mysqlPool, db, 'contact_remarks', 'idx_contact_remarks_posted'))) {
    await mysqlPool.query(
      `CREATE INDEX idx_contact_remarks_posted ON contact_remarks (posted, posted_at DESC)`
    );
    console.log('[schema] Added idx_contact_remarks_posted');
  }

  if (!(await indexExists(mysqlPool, db, 'contact_remarks', 'idx_contact_remarks_whatsapp_created'))) {
    await mysqlPool.query(
      `CREATE INDEX idx_contact_remarks_whatsapp_created ON contact_remarks (whatsapp, created_at DESC)`
    );
    console.log('[schema] Added idx_contact_remarks_whatsapp_created');
  }

  console.log('[schema] contact_remarks posted columns ready');
}
