/**
 * Batch schedule timestamps are optional (no longer required at create/publish).
 */

async function makeDatetimeNullable(pool, db, table, column) {
  const [rows] = await pool.query(
    `SELECT IS_NULLABLE, DATA_TYPE, COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, table, column]
  );
  const col = rows[0];
  if (!col) return;
  if (String(col.IS_NULLABLE).toUpperCase() === 'YES') return;
  const dataType = String(col.DATA_TYPE || '').toLowerCase();
  if (dataType !== 'datetime' && dataType !== 'timestamp' && dataType !== 'date') return;
  await pool.query(`ALTER TABLE ${table} MODIFY COLUMN ${column} DATETIME NULL`);
  console.log(`[schema] ${table}.${column}: NOT NULL → NULL`);
}

export async function ensureCourseBatchScheduleNullableSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  const [tbl] = await mysqlPool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'course_batches'`,
    [db]
  );
  if (Number(tbl[0]?.n ?? 0) === 0) return;

  for (const column of ['start_date', 'end_date', 'enrollment_open_at', 'enrollment_close_at']) {
    await makeDatetimeNullable(mysqlPool, db, 'course_batches', column);
  }
}
