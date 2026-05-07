import { mysqlPool } from '../config/mysql.js';

function toRemark(row) {
  return {
    id: row.id,
    name: row.name || '',
    email: row.email || '',
    message: row.message,
    pageUrl: row.page_url || '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createContactRemark(payload) {
  const [result] = await mysqlPool.query(
    `INSERT INTO contact_remarks (name, email, message, page_url, status)
     VALUES (?, ?, ?, ?, 'new')`,
    [payload.name || null, payload.email || null, payload.message, payload.pageUrl || null]
  );
  const [rows] = await mysqlPool.query(`SELECT * FROM contact_remarks WHERE id = ? LIMIT 1`, [result.insertId]);
  return rows[0] ? toRemark(rows[0]) : null;
}

export async function listContactRemarks() {
  const [rows] = await mysqlPool.query(
    `SELECT * FROM contact_remarks ORDER BY FIELD(status, 'new', 'read'), created_at DESC, id DESC`
  );
  return rows.map(toRemark);
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
