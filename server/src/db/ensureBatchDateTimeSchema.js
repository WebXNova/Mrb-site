/**
 * Migrate course_batches.start_date and end_date from DATE to DATETIME.
 * Preserves legacy end-of-day semantics for existing date-only end_date values.
 */

async function columnDataType(pool, db, table, column) {
  const [rows] = await pool.query(
    `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, table, column]
  );
  return String(rows[0]?.DATA_TYPE ?? '').toLowerCase();
}

async function tableExists(pool, db, table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, table]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function ensureBatchDateTimeSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  if (!(await tableExists(mysqlPool, db, 'course_batches'))) return;

  for (const column of ['start_date', 'end_date']) {
    const dataType = await columnDataType(mysqlPool, db, 'course_batches', column);
    if (dataType !== 'date') continue;

    await mysqlPool.query(
      `ALTER TABLE course_batches MODIFY COLUMN ${column} DATETIME NOT NULL`
    );
    console.log(`[migration] course_batches.${column}: DATE → DATETIME`);

    if (column === 'end_date') {
      // Legacy DATE end_date was validated as end-of-day UTC; preserve that instant.
      await mysqlPool.query(
        `UPDATE course_batches
         SET end_date = TIMESTAMP(DATE(end_date), '23:59:59')
         WHERE TIME(end_date) = '00:00:00'`
      );
      console.log('[migration] course_batches.end_date: backfilled 23:59:59 for legacy rows');
    }
  }
}
