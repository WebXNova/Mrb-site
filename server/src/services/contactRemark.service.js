import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';

const PHONE_MINUTE_LIMIT = 1;
const PHONE_DAILY_LIMIT = 3;

function toRemark(row) {
  return {
    id: row.id,
    name: row.name || '',
    email: row.email || '',
    whatsapp: row.whatsapp || '',
    message: row.message,
    pageUrl: row.page_url || '',
    status: row.status,
    posted: Boolean(row.posted),
    postedAt: row.posted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublicPostedRemark(row) {
  return {
    id: row.id,
    name: row.name || 'Student',
    message: row.message,
    postedAt: row.posted_at,
  };
}

export async function assertContactRemarkSubmitAllowed({ whatsapp, message }) {
  if (!whatsapp) return;

  const [[minuteRow]] = await mysqlPool.query(
    `SELECT COUNT(*) AS cnt FROM contact_remarks
     WHERE whatsapp = ? AND created_at >= (NOW() - INTERVAL 1 MINUTE)`,
    [whatsapp]
  );
  if (Number(minuteRow?.cnt || 0) >= PHONE_MINUTE_LIMIT) {
    throw new ApiError(429, 'Please wait one minute before sending another remark from this number.', {
      code: 'RATE_LIMITED',
    });
  }

  const [[dayRow]] = await mysqlPool.query(
    `SELECT COUNT(*) AS cnt FROM contact_remarks
     WHERE whatsapp = ? AND created_at >= (NOW() - INTERVAL 24 HOUR)`,
    [whatsapp]
  );
  if (Number(dayRow?.cnt || 0) >= PHONE_DAILY_LIMIT) {
    throw new ApiError(429, 'This WhatsApp number has reached the daily remark limit (3 per day).', {
      code: 'RATE_LIMITED',
    });
  }

  const [[dupRow]] = await mysqlPool.query(
    `SELECT id FROM contact_remarks
     WHERE whatsapp = ? AND message = ? AND created_at >= (NOW() - INTERVAL 24 HOUR)
     LIMIT 1`,
    [whatsapp, message]
  );
  if (dupRow?.id) {
    throw new ApiError(429, 'You already sent this remark recently. Please wait before submitting again.', {
      code: 'DUPLICATE_REMARK',
    });
  }
}

export async function createContactRemark(payload) {
  const [result] = await mysqlPool.query(
    `INSERT INTO contact_remarks (name, email, whatsapp, message, page_url, status)
     VALUES (?, ?, ?, ?, ?, 'new')`,
    [
      payload.name || null,
      payload.email || null,
      payload.whatsapp || null,
      payload.message,
      payload.pageUrl || null,
    ]
  );
  const [rows] = await mysqlPool.query(`SELECT * FROM contact_remarks WHERE id = ? LIMIT 1`, [
    result.insertId,
  ]);
  return rows[0] ? toRemark(rows[0]) : null;
}

export async function listContactRemarks() {
  const [rows] = await mysqlPool.query(
    `SELECT * FROM contact_remarks
     ORDER BY FIELD(status, 'new', 'read'), created_at DESC, id DESC`
  );
  return rows.map(toRemark);
}

export async function listPostedContactRemarksPublic(limit = 24) {
  const [rows] = await mysqlPool.query(
    `SELECT id, name, message, posted_at FROM contact_remarks
     WHERE posted = 1
     ORDER BY posted_at DESC, id DESC
     LIMIT ?`,
    [limit]
  );
  return rows.map(toPublicPostedRemark);
}

export async function markContactRemarkAsRead(remarkId) {
  await mysqlPool.query(
    `UPDATE contact_remarks
     SET status = 'read', updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [remarkId]
  );
  const [rows] = await mysqlPool.query(`SELECT * FROM contact_remarks WHERE id = ? LIMIT 1`, [remarkId]);
  return rows[0] ? toRemark(rows[0]) : null;
}

export async function postContactRemarkToHomepage(remarkId) {
  await mysqlPool.query(
    `UPDATE contact_remarks
     SET posted = 1, posted_at = CURRENT_TIMESTAMP, status = 'read', updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [remarkId]
  );
  const [rows] = await mysqlPool.query(`SELECT * FROM contact_remarks WHERE id = ? LIMIT 1`, [remarkId]);
  return rows[0] ? toRemark(rows[0]) : null;
}

export async function unpostContactRemarkFromHomepage(remarkId) {
  await mysqlPool.query(
    `UPDATE contact_remarks
     SET posted = 0, posted_at = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [remarkId]
  );
  const [rows] = await mysqlPool.query(`SELECT * FROM contact_remarks WHERE id = ? LIMIT 1`, [remarkId]);
  return rows[0] ? toRemark(rows[0]) : null;
}
