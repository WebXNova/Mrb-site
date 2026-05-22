/**
 * Ensures `enrollments.access_status` exists on existing databases and matches production enum.
 * Enum: ENUM('active', 'inactive', 'revoked') NOT NULL DEFAULT 'inactive'
 *
 * Full `schema.sql` only runs when base geo schema is absent (`provinces` missing).
 */
export async function ensureEnrollmentAccessSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  const [tableRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'enrollments'`,
    [db]
  );
  if (Number(tableRows[0]?.n) === 0) {
    return;
  }

  const [colCountRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'enrollments' AND COLUMN_NAME = 'access_status'`,
    [db]
  );
  const colCount = Number(colCountRows[0]?.n ?? 0);

  let columnType = '';
  if (colCount > 0) {
    const [typeRows] = await mysqlPool.query(
      `SELECT COLUMN_TYPE AS column_type
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'enrollments' AND COLUMN_NAME = 'access_status'
       LIMIT 1`,
      [db]
    );
    columnType = String(typeRows[0]?.column_type || '').toLowerCase();
  }

  const fullEnumSql = `ENUM('active', 'inactive', 'revoked') NOT NULL DEFAULT 'inactive'`;

  if (colCount === 0) {
    await mysqlPool.query(
      `ALTER TABLE enrollments ADD COLUMN access_status ${fullEnumSql} AFTER status`
    );
    console.log('[schema] Added enrollments.access_status (active, inactive, revoked)');
  } else if (!columnType.includes('revoked')) {
    await mysqlPool.query(
      `ALTER TABLE enrollments MODIFY COLUMN access_status ${fullEnumSql}`
    );
    console.log('[schema] Upgraded enrollments.access_status to include revoked');
  }

  const [idxRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'enrollments' AND INDEX_NAME = 'idx_enrollments_user_access'`,
    [db]
  );
  if (Number(idxRows[0]?.n) === 0) {
    await mysqlPool.query(
      `ALTER TABLE enrollments ADD KEY idx_enrollments_user_access (user_id, access_status)`
    );
    console.log('[schema] Added idx_enrollments_user_access');
  }
}
