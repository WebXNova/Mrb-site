/**
 * H-04/H-05 — Ensure processed_webhooks table exists (idempotent).
 */

const MIGRATION_NAME = 'processed_webhooks';

async function indexExists(mysqlPool, db, indexName) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'processed_webhooks' AND INDEX_NAME = ?`,
    [db, indexName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function tableExists(mysqlPool, db) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'processed_webhooks'`,
    [db]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function ensureProcessedWebhooksSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };

  if (await tableExists(mysqlPool, db)) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'table_exists' };
  }

  const sql = `CREATE TABLE processed_webhooks (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    webhook_hash CHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_processed_webhooks_hash (webhook_hash),
    KEY idx_processed_webhooks_created_at (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

  if (dryRun) {
    return { migration: MIGRATION_NAME, dryRun: true, sql };
  }

  await mysqlPool.query(sql);
  return { migration: MIGRATION_NAME, ok: true };
}

/**
 * Ensure retention index exists on existing deployments.
 * @param {import('mysql2/promise').Pool} mysqlPool
 */
export async function ensureProcessedWebhooksRetentionIndex(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { skipped: true, reason: 'no_database' };
  if (!(await tableExists(mysqlPool, db))) {
    return { skipped: true, reason: 'table_missing' };
  }
  if (await indexExists(mysqlPool, db, 'idx_processed_webhooks_created_at')) {
    return { skipped: true, reason: 'index_exists' };
  }
  await mysqlPool.query(
    `ALTER TABLE processed_webhooks ADD KEY idx_processed_webhooks_created_at (created_at)`
  );
  return { ok: true, index: 'idx_processed_webhooks_created_at' };
}
