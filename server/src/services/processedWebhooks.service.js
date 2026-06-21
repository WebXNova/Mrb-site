/**
 * H-04/H-05 — Durable webhook replay ledger (Layer 2).
 */

import { mysqlPool } from '../config/mysql.js';

/**
 * @param {string} webhookHash
 */
export async function isWebhookHashProcessed(webhookHash) {
  const hash = String(webhookHash || '').trim();
  if (!hash) return false;
  const [rows] = await mysqlPool.query(
    `SELECT id FROM processed_webhooks WHERE webhook_hash = ? LIMIT 1`,
    [hash]
  );
  return Boolean(rows[0]?.id);
}

/**
 * Insert webhook hash — UNIQUE constraint rejects duplicates.
 *
 * @param {string} webhookHash
 * @param {import('mysql2/promise').PoolConnection} [connection]
 * @returns {Promise<'recorded' | 'duplicate'>}
 */
export async function recordProcessedWebhook(webhookHash, connection = null) {
  const hash = String(webhookHash || '').trim();
  if (!hash) return 'duplicate';
  const db = connection ?? mysqlPool;
  try {
    await db.query(`INSERT INTO processed_webhooks (webhook_hash) VALUES (?)`, [hash]);
    return 'recorded';
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return 'duplicate';
    }
    throw error;
  }
}

/**
 * Claim webhook hash before fulfillment (dev fallback when Redis unavailable).
 *
 * @param {string} webhookHash
 * @returns {Promise<'claimed' | 'duplicate'>}
 */
export async function tryClaimProcessedWebhook(webhookHash) {
  const result = await recordProcessedWebhook(webhookHash);
  return result === 'recorded' ? 'claimed' : 'duplicate';
}

/**
 * Release a pre-fulfillment DB claim after retriable failure.
 *
 * @param {string} webhookHash
 */
export async function removeProcessedWebhook(webhookHash) {
  const hash = String(webhookHash || '').trim();
  if (!hash) return;
  await mysqlPool.query(`DELETE FROM processed_webhooks WHERE webhook_hash = ? LIMIT 1`, [hash]);
}
