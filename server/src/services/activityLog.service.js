import { mysqlPool } from '../config/mysql.js';
import { sanitizeMetadata } from '../utils/logSanitizer.js';

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function toActivityLog(row) {
  return {
    id: row.id,
    userId: row.user_id,
    role: row.role,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: parseMetadata(row.metadata_json),
    createdAt: row.created_at,
  };
}

/**
 * Low-level activity_logs insert — throws on failure (used by hardened Q&A audit pipeline).
 */
export async function insertActivityLogRecord({
  userId = null,
  role = 'system',
  action,
  entityType,
  entityId = null,
  metadata = {},
}) {
  const safeMetadata = sanitizeMetadata(metadata || {});
  await mysqlPool.query(
    `INSERT INTO activity_logs (user_id, role, action, entity_type, entity_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, role, action, entityType, entityId, JSON.stringify(safeMetadata)]
  );
}

export async function logActivity({
  userId = null,
  role = 'system',
  action,
  entityType,
  entityId = null,
  metadata = {},
}) {
  try {
    await insertActivityLogRecord({
      userId,
      role,
      action,
      entityType,
      entityId,
      metadata,
    });
  } catch (error) {
    // Legacy non-Q&A paths: swallow to avoid blocking primary flow.
    console.error('ActivityLog error:', error.message);
  }
}

export async function listRecentActivityLogs(limit) {
  const [rows] = await mysqlPool.query(
    `SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?`,
    [limit]
  );
  return rows.map(toActivityLog);
}
