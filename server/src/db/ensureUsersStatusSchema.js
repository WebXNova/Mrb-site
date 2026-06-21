/**
 * Ensures users.status ENUM includes 'inactive' for teacher activation.
 */

export async function ensureUsersStatusSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  const [tableRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'`,
    [db]
  );
  if (Number(tableRows[0]?.n) === 0) return;

  const [typeRows] = await mysqlPool.query(
    `SELECT COLUMN_TYPE AS column_type FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'status' LIMIT 1`,
    [db]
  );
  const columnType = String(typeRows[0]?.column_type || '').toLowerCase();
  if (columnType.includes('inactive')) return;

  await mysqlPool.query(
    `ALTER TABLE users MODIFY COLUMN status ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active'`
  );
  console.log('[schema] Upgraded users.status to include inactive');
}
