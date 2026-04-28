import { customAlphabet } from 'nanoid';
import { mysqlPool } from '../config/mysql.js';

const nanoid = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 10);

function toCode(row) {
  return {
    id: row.id,
    code: row.code,
    batchLabel: row.batch_label,
    isUsed: !!row.is_used,
    usedBy: row.used_by,
    usedAt: row.used_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export async function listCodes() {
  const [rows] = await mysqlPool.query(`SELECT * FROM mrb_codes ORDER BY created_at DESC`);
  return rows.map(toCode);
}

export async function generateCodes({ count = 1, batchLabel = null, expiresAt = null }) {
  const values = Array.from({ length: count }, () => [nanoid(), batchLabel, expiresAt || null]);
  await mysqlPool.query(
    `INSERT INTO mrb_codes (code, batch_label, expires_at) VALUES ?`,
    [values]
  );
  return listCodes();
}

export async function deleteUnusedCode(codeId) {
  const [result] = await mysqlPool.query(
    `DELETE FROM mrb_codes WHERE id = ? AND is_used = FALSE`,
    [codeId]
  );
  return result.affectedRows > 0;
}
