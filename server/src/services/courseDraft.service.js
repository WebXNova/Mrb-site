import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';

function normalizeUserId(userId) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new ApiError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }
  return uid;
}

function parseDraftJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * @param {number} userId
 */
export async function loadCourseDraft(userId) {
  const uid = normalizeUserId(userId);
  const [rows] = await mysqlPool.query(
    `SELECT draft_json, updated_at
     FROM course_drafts
     WHERE user_id = ?
     LIMIT 1`,
    [uid]
  );
  const row = rows[0];
  if (!row) {
    return { draft: null, updatedAt: null };
  }

  return {
    draft: parseDraftJson(row.draft_json),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

/**
 * @param {number} userId
 * @param {{ clear?: true, course?: object, pricing?: object, batches?: object[], subjects?: object[], step?: number }} body
 */
export async function saveCourseDraft(userId, body) {
  const uid = normalizeUserId(userId);

  if (body?.clear === true) {
    await mysqlPool.query(`DELETE FROM course_drafts WHERE user_id = ?`, [uid]);
    return { updatedAt: null, cleared: true };
  }

  const draftJson = {
    course: body.course ?? {},
    pricing: body.pricing ?? {},
    batches: Array.isArray(body.batches) ? body.batches : [],
    subjects: Array.isArray(body.subjects) ? body.subjects : [],
    step: typeof body.step === 'number' ? body.step : 0,
  };

  await mysqlPool.query(
    `INSERT INTO course_drafts (user_id, draft_json, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       draft_json = VALUES(draft_json),
       updated_at = CURRENT_TIMESTAMP`,
    [uid, JSON.stringify(draftJson)]
  );

  const [rows] = await mysqlPool.query(
    `SELECT updated_at FROM course_drafts WHERE user_id = ? LIMIT 1`,
    [uid]
  );

  return {
    updatedAt: rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : new Date().toISOString(),
    cleared: false,
  };
}
