/**
 * Payment receiving accounts — admin CRUD with transactional audit logging.
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import {
  parseCreatePaymentAccountBody,
  parseUpdatePaymentAccountBody,
} from '../validators/paymentAccount.schema.js';

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
function snapshotAccount(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    method: String(row.method),
    account_number: String(row.account_number),
    account_title: String(row.account_title),
    is_active: Boolean(row.is_active),
  };
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{
 *   paymentAccountId: number,
 *   action: 'created'|'updated'|'activated'|'deactivated',
 *   changedBy: number,
 *   ipAddress: string,
 *   oldValue: object|null,
 *   newValue: object,
 * }} params
 */
async function insertAuditLogInTransaction(connection, params) {
  await connection.query(
    `INSERT INTO payment_account_audit_log
      (payment_account_id, action, changed_by, old_value, new_value, ip_address)
     VALUES (?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?)`,
    [
      params.paymentAccountId,
      params.action,
      params.changedBy,
      params.oldValue ? JSON.stringify(params.oldValue) : null,
      JSON.stringify(params.newValue),
      params.ipAddress,
    ]
  );
}

function mapAccountRow(row) {
  return {
    id: Number(row.id),
    method: row.method,
    accountNumber: row.account_number,
    accountTitle: row.account_title,
    isActive: Boolean(row.is_active),
    createdBy: Number(row.created_by),
    updatedBy: row.updated_by == null ? null : Number(row.updated_by),
    createdByName: row.created_by_name || null,
    updatedByName: row.updated_by_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const LIST_SQL = `
  SELECT
    pa.id,
    pa.method,
    pa.account_number,
    pa.account_title,
    pa.is_active,
    pa.created_by,
    pa.updated_by,
    pa.created_at,
    pa.updated_at,
    cb.full_name AS created_by_name,
    ub.full_name AS updated_by_name
  FROM payment_accounts pa
  INNER JOIN users cb ON cb.id = pa.created_by
  LEFT JOIN users ub ON ub.id = pa.updated_by
`;

export async function listPaymentAccounts() {
  const [rows] = await mysqlPool.query(
    `${LIST_SQL} ORDER BY pa.method ASC, pa.is_active DESC, pa.updated_at DESC, pa.id DESC`
  );
  return rows.map(mapAccountRow);
}

/**
 * @param {number} accountId
 */
export async function getPaymentAccountById(accountId) {
  const id = Number(accountId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid payment account id');
  }
  const [rows] = await mysqlPool.query(`${LIST_SQL} WHERE pa.id = ? LIMIT 1`, [id]);
  return rows[0] ? mapAccountRow(rows[0]) : null;
}

/**
 * @param {number} accountId
 */
export async function listPaymentAccountAuditLog(accountId) {
  const id = Number(accountId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid payment account id');
  }

  const account = await getPaymentAccountById(id);
  if (!account) {
    throw new ApiError(404, 'Payment account not found');
  }

  const [rows] = await mysqlPool.query(
    `SELECT
       al.id,
       al.payment_account_id,
       al.action,
       al.changed_by,
       al.old_value,
       al.new_value,
       al.ip_address,
       al.created_at,
       u.full_name AS changed_by_name,
       u.email AS changed_by_email
     FROM payment_account_audit_log al
     INNER JOIN users u ON u.id = al.changed_by
     WHERE al.payment_account_id = ?
     ORDER BY al.created_at DESC, al.id DESC`,
    [id]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    paymentAccountId: Number(row.payment_account_id),
    action: row.action,
    changedBy: Number(row.changed_by),
    changedByName: row.changed_by_name || null,
    changedByEmail: row.changed_by_email || null,
    oldValue: row.old_value ?? null,
    newValue: row.new_value ?? null,
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  }));
}

/**
 * @param {{ body: object, actorId: number, ipAddress: string }}
 */
export async function createPaymentAccount({ body, actorId, ipAddress }) {
  const dto = parseCreatePaymentAccountBody(body);
  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    const [insertResult] = await connection.query(
      `INSERT INTO payment_accounts (method, account_number, account_title, is_active, created_by, updated_by)
       VALUES (?, ?, ?, FALSE, ?, ?)`,
      [dto.method, dto.account_number, dto.account_title, actorId, actorId]
    );

    const accountId = Number(insertResult.insertId);
    const newSnapshot = {
      id: accountId,
      method: dto.method,
      account_number: dto.account_number,
      account_title: dto.account_title,
      is_active: false,
    };

    await insertAuditLogInTransaction(connection, {
      paymentAccountId: accountId,
      action: 'created',
      changedBy: actorId,
      ipAddress,
      oldValue: null,
      newValue: newSnapshot,
    });

    await connection.commit();
    const created = await getPaymentAccountById(accountId);
    if (!created) {
      throw new ApiError(500, 'Payment account missing after create');
    }
    return created;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * @param {{ accountId: number, body: object, actorId: number, ipAddress: string }}
 */
export async function updatePaymentAccount({ accountId, body, actorId, ipAddress }) {
  const id = Number(accountId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid payment account id');
  }

  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, method, account_number, account_title, is_active
       FROM payment_accounts
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );
    const existing = rows[0];
    if (!existing) {
      throw new ApiError(404, 'Payment account not found');
    }

    const dto = parseUpdatePaymentAccountBody(body, existing.method);
    const oldSnapshot = snapshotAccount(existing);

    const [updateResult] = await connection.query(
      `UPDATE payment_accounts
       SET account_number = ?, account_title = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [dto.account_number, dto.account_title, actorId, id]
    );

    if (Number(updateResult?.affectedRows ?? 0) === 0) {
      throw new ApiError(409, 'Payment account update failed');
    }

    const newSnapshot = {
      ...oldSnapshot,
      account_number: dto.account_number,
      account_title: dto.account_title,
    };

    await insertAuditLogInTransaction(connection, {
      paymentAccountId: id,
      action: 'updated',
      changedBy: actorId,
      ipAddress,
      oldValue: oldSnapshot,
      newValue: newSnapshot,
    });

    await connection.commit();
    const updated = await getPaymentAccountById(id);
    if (!updated) {
      throw new ApiError(500, 'Payment account missing after update');
    }
    return updated;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * @param {{ accountId: number, actorId: number, ipAddress: string }}
 */
export async function activatePaymentAccount({ accountId, actorId, ipAddress }) {
  const id = Number(accountId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid payment account id');
  }

  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    const [targetRows] = await connection.query(
      `SELECT id, method FROM payment_accounts WHERE id = ? LIMIT 1`,
      [id]
    );
    const targetMeta = targetRows[0];
    if (!targetMeta) {
      throw new ApiError(404, 'Payment account not found');
    }

    const method = String(targetMeta.method);

    const [methodRows] = await connection.query(
      `SELECT id, method, account_number, account_title, is_active
       FROM payment_accounts
       WHERE method = ?
       ORDER BY id
       FOR UPDATE`,
      [method]
    );

    const targetLocked = methodRows.find((row) => Number(row.id) === id);
    if (!targetLocked) {
      throw new ApiError(404, 'Payment account not found');
    }

    for (const row of methodRows) {
      if (Number(row.id) === id || !row.is_active) continue;
      const oldSnapshot = snapshotAccount(row);
      await connection.query(
        `UPDATE payment_accounts
         SET is_active = FALSE, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [actorId, row.id]
      );
      await insertAuditLogInTransaction(connection, {
        paymentAccountId: Number(row.id),
        action: 'deactivated',
        changedBy: actorId,
        ipAddress,
        oldValue: oldSnapshot,
        newValue: { ...oldSnapshot, is_active: false },
      });
    }

    const targetOld = snapshotAccount(targetLocked);
    const wasActive = Boolean(targetLocked.is_active);

    await connection.query(
      `UPDATE payment_accounts
       SET is_active = TRUE, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [actorId, id]
    );

    if (!wasActive) {
      await insertAuditLogInTransaction(connection, {
        paymentAccountId: id,
        action: 'activated',
        changedBy: actorId,
        ipAddress,
        oldValue: targetOld,
        newValue: { ...targetOld, is_active: true },
      });
    }

    await connection.commit();
    return getPaymentAccountById(id);
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * @param {{ accountId: number, actorId: number, ipAddress: string }}
 */
export async function deactivatePaymentAccount({ accountId, actorId, ipAddress }) {
  const id = Number(accountId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid payment account id');
  }

  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, method, account_number, account_title, is_active
       FROM payment_accounts
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );
    const existing = rows[0];
    if (!existing) {
      throw new ApiError(404, 'Payment account not found');
    }

    if (!existing.is_active) {
      await connection.commit();
      return getPaymentAccountById(id);
    }

    const oldSnapshot = snapshotAccount(existing);

    await connection.query(
      `UPDATE payment_accounts
       SET is_active = FALSE, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [actorId, id]
    );

    await insertAuditLogInTransaction(connection, {
      paymentAccountId: id,
      action: 'deactivated',
      changedBy: actorId,
      ipAddress,
      oldValue: oldSnapshot,
      newValue: { ...oldSnapshot, is_active: false },
    });

    await connection.commit();
    return getPaymentAccountById(id);
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Count active accounts per method — test helper.
 * @param {'jazzcash'|'easypaisa'} method
 */
export async function countActivePaymentAccountsForMethod(method) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n FROM payment_accounts WHERE method = ? AND is_active = TRUE`,
    [method]
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * @param {number} accountId
 */
export async function deletePaymentAccountForTests(accountId) {
  const id = Number(accountId);
  await mysqlPool.query(`DELETE FROM payment_account_audit_log WHERE payment_account_id = ?`, [id]);
  await mysqlPool.query(`DELETE FROM payment_accounts WHERE id = ?`, [id]);
}
