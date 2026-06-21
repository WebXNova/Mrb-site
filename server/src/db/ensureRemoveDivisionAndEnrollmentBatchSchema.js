/**
 * Removes deprecated Division geography layer and enrollment batch_number column.
 * Idempotent — safe on fresh installs (columns/tables already absent).
 */

async function columnExists(mysqlPool, db, table, column) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, table, column]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function indexExists(mysqlPool, db, table, indexName) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [db, table, indexName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function tableExists(mysqlPool, db, table) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, table]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function dropFkIfExists(mysqlPool, db, table, constraintName) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [db, table, constraintName]
  );
  if (Number(rows[0]?.n ?? 0) > 0) {
    await mysqlPool.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${constraintName}\``);
    console.log(`[schema] Dropped FK ${table}.${constraintName}`);
  }
}

async function dropIndexIfExists(mysqlPool, db, table, indexName) {
  if (await indexExists(mysqlPool, db, table, indexName)) {
    await mysqlPool.query(`ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\``);
    console.log(`[schema] Dropped index ${table}.${indexName}`);
  }
}

async function dropColumnIfExists(mysqlPool, db, table, column) {
  if (await columnExists(mysqlPool, db, table, column)) {
    await mysqlPool.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
    console.log(`[schema] Dropped column ${table}.${column}`);
  }
}

export async function ensureRemoveDivisionAndEnrollmentBatchSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  if (await tableExists(mysqlPool, db, 'enrollments')) {
    await dropFkIfExists(mysqlPool, db, 'enrollments', 'fk_enrollments_division');
    await dropIndexIfExists(mysqlPool, db, 'enrollments', 'idx_enrollments_division_id');
    await dropIndexIfExists(mysqlPool, db, 'enrollments', 'idx_enrollments_batch');
    await dropColumnIfExists(mysqlPool, db, 'enrollments', 'division_id');
    await dropColumnIfExists(mysqlPool, db, 'enrollments', 'batch_number');
  }

  if (await tableExists(mysqlPool, db, 'cities')) {
    await dropFkIfExists(mysqlPool, db, 'cities', 'fk_cities_division');
    await dropIndexIfExists(mysqlPool, db, 'cities', 'idx_cities_division');
    await dropColumnIfExists(mysqlPool, db, 'cities', 'division_id');
  }

  if (await tableExists(mysqlPool, db, 'districts')) {
    await dropFkIfExists(mysqlPool, db, 'districts', 'fk_districts_division');
    await dropIndexIfExists(mysqlPool, db, 'districts', 'idx_districts_division');
    await dropIndexIfExists(mysqlPool, db, 'districts', 'uq_districts_division_name');
    await dropIndexIfExists(mysqlPool, db, 'districts', 'uq_districts_division_slug');
    await dropColumnIfExists(mysqlPool, db, 'districts', 'division_id');

    if (!(await indexExists(mysqlPool, db, 'districts', 'uq_districts_province_slug'))) {
      await mysqlPool.query(
        `ALTER TABLE districts ADD CONSTRAINT uq_districts_province_slug UNIQUE (province_id, slug)`
      );
      console.log('[schema] Added districts.uq_districts_province_slug');
    }
  }

  if (await tableExists(mysqlPool, db, 'divisions')) {
    await mysqlPool.query('DROP TABLE divisions');
    console.log('[schema] Dropped divisions table');
  }
}
