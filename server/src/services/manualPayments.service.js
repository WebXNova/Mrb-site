/**
 * Student manual payment proofs — checkout info, submit, status.
 * Risk intelligence is stored on the row but never returned to students.
 */

import { randomInt } from 'crypto';
import path from 'path';
import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { parseSubmitManualPaymentFields, parseValidateManualPaymentCouponBody } from '../validators/manualPayment.schema.js';
import {
  previewCouponForManualPayment,
  redeemCouponForManualPaymentSubmit,
} from './couponRedemption.service.js';
import {
  computeManualPaymentRisk,
  parseRiskFlagsJson,
  toStudentManualPaymentView,
  MANUAL_PAYMENT_RISK_FLAGS,
} from './manualPaymentRisk.service.js';
import {
  MANUAL_PAYMENT_UPLOAD_DIR,
  resolveStoredScreenshotFilename,
  safeUnlink,
} from './manualPaymentScreenshotUpload.service.js';
import {
  countRecentDifferentTransactionIds,
  loadPriorSenderNumbers,
  lockAndLoadScreenshotHashMatches,
  lockAndLoadTransactionIdMatches,
} from './manualPaymentFraudLookup.service.js';

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateReferenceCode() {
  let code = 'MRB-';
  for (let i = 0; i < 8; i += 1) {
    code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }
  return code;
}

/**
 * @param {number} orderId
 * @param {number} studentId
 * @param {import('mysql2/promise').PoolConnection} [connection]
 */
export async function loadOwnedPendingOrder(orderId, studentId, connection = mysqlPool) {
  const id = Number(orderId);
  const uid = Number(studentId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid order id');
  }
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new ApiError(401, 'Authentication required');
  }

  const [rows] = await connection.query(
    `SELECT
       o.id,
       o.user_id,
       o.course_id,
       o.enrollment_id,
       o.amount,
       o.currency,
       o.status,
       o.gateway,
       o.reference_code,
       e.user_id AS enrollment_user_id
     FROM orders o
     INNER JOIN enrollments e ON e.id = o.enrollment_id
     WHERE o.id = ?
     LIMIT 1`,
    [id]
  );
  const row = rows[0];
  if (!row) {
    throw new ApiError(404, 'Order not found', { code: 'ORDER_NOT_FOUND' });
  }
  if (Number(row.user_id) !== uid || Number(row.enrollment_user_id) !== uid) {
    throw new ApiError(403, 'You do not have access to this order', { code: 'ORDER_ACCESS_DENIED' });
  }
  return row;
}

async function ensureOrderReferenceCode(order) {
  if (order.reference_code) return String(order.reference_code);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateReferenceCode();
    try {
      const [result] = await mysqlPool.query(
        `UPDATE orders SET reference_code = ? WHERE id = ? AND reference_code IS NULL`,
        [code, order.id]
      );
      if (Number(result?.affectedRows ?? 0) > 0) return code;
      const [rows] = await mysqlPool.query(`SELECT reference_code FROM orders WHERE id = ? LIMIT 1`, [
        order.id,
      ]);
      if (rows[0]?.reference_code) return String(rows[0].reference_code);
    } catch (error) {
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
    }
  }
  throw new ApiError(500, 'Could not allocate a payment reference code');
}

/**
 * GET checkout-info
 * @param {{ studentId: number, orderId: number }}
 */
export async function getManualCheckoutInfo({ studentId, orderId }) {
  const order = await loadOwnedPendingOrder(orderId, studentId);
  if (String(order.status) !== 'pending') {
    throw new ApiError(409, 'This order is not awaiting payment', { code: 'ORDER_NOT_SUBMITTABLE' });
  }

  const accounts = await listActiveReceivingAccounts();
  if (!accounts.length) {
    throw new ApiError(
      503,
      'Payment temporarily unavailable, please contact support',
      { code: 'PAYMENT_UNAVAILABLE' }
    );
  }

  const referenceCode = await ensureOrderReferenceCode(order);

  return {
    orderId: Number(order.id),
    enrollmentId: Number(order.enrollment_id),
    courseId: Number(order.course_id),
    amount: Number(order.amount),
    currency: String(order.currency || 'PKR'),
    referenceCode,
    accounts: accounts.map((row) => ({
      id: row.id,
      method: row.method,
      accountNumber: row.accountNumber,
      accountTitle: row.accountTitle,
    })),
  };
}

/**
 * POST validate-coupon — preview only, no used_count increment.
 * @param {{ studentId: number, body: Record<string, unknown> }}
 */
export async function validateManualPaymentCoupon({ studentId, body }) {
  const dto = parseValidateManualPaymentCouponBody(body);
  const order = await loadOwnedPendingOrder(dto.order_id, studentId);
  return previewCouponForManualPayment({ order, code: dto.code });
}

async function listActiveReceivingAccounts() {
  const [rows] = await mysqlPool.query(
    `SELECT id, method, account_number, account_title
     FROM payment_accounts
     WHERE is_active = TRUE
     ORDER BY method ASC, id ASC`
  );
  return rows.map((row) => ({
    id: Number(row.id),
    method: row.method,
    accountNumber: row.account_number,
    accountTitle: row.account_title,
  }));
}

async function findLatestSubmissionForOrder(connection, orderId) {
  const [rows] = await connection.query(
    `SELECT
       mp.id,
       mp.order_id,
       mp.status,
       mp.transaction_id,
       mp.amount_claimed,
       mp.payment_method,
       mp.sender_phone_number,
       mp.sender_account_title,
       mp.screenshot_url,
       mp.created_at,
       mp.admin_note,
       pa.method AS receiver_method,
       pa.account_number AS receiver_account_number,
       pa.account_title AS receiver_account_title
     FROM manual_payments mp
     LEFT JOIN payment_accounts pa ON pa.id = mp.payment_account_id
     WHERE mp.order_id = ?
     ORDER BY mp.id DESC
     LIMIT 1`,
    [orderId]
  );
  return rows[0] || null;
}

export function enrichStudentSubmissionView(row, orderId) {
  const base = toStudentManualPaymentView(row);
  if (base.status === 'none') return base;

  const hasScreenshot = Boolean(resolveStoredScreenshotFilename(row.screenshot_url));
  const receiverMethod = row.receiver_method || row.payment_method;
  const receiverAccountNumber = row.receiver_account_number;

  return {
    ...base,
    senderPhoneNumber: String(row.sender_phone_number || ''),
    senderAccountTitle: String(row.sender_account_title || ''),
    receiverAccount:
      receiverAccountNumber != null && String(receiverAccountNumber).trim() !== ''
        ? {
            method: String(receiverMethod || base.paymentMethod || ''),
            accountNumber: String(receiverAccountNumber),
            accountTitle: String(row.receiver_account_title || ''),
          }
        : null,
    hasScreenshot,
    screenshotUrl: hasScreenshot ? `/api/payments/manual/${Number(orderId)}/screenshot` : null,
  };
}

/**
 * Student status — strips risk fields.
 * @param {{ studentId: number, orderId: number }}
 */
export async function getManualPaymentStatus({ studentId, orderId }) {
  const order = await loadOwnedPendingOrder(orderId, studentId);
  const latest = await findLatestSubmissionForOrder(mysqlPool, orderId);
  const view = enrichStudentSubmissionView(latest, orderId);
  if (view.status === 'none') return view;
  return {
    ...view,
    referenceCode: order.reference_code ? String(order.reference_code) : null,
  };
}

/**
 * Student-owned screenshot for the latest submission on an order.
 * @param {{ studentId: number, orderId: number }}
 */
export async function getManualPaymentScreenshotForStudent({ studentId, orderId }) {
  const oid = Number(orderId);
  await loadOwnedPendingOrder(oid, studentId);
  const latest = await findLatestSubmissionForOrder(mysqlPool, oid);
  if (!latest) {
    throw new ApiError(404, 'No payment submission found', { code: 'SUBMISSION_NOT_FOUND' });
  }
  const filename = resolveStoredScreenshotFilename(latest.screenshot_url);
  if (!filename) {
    throw new ApiError(404, 'Screenshot not found', { code: 'SCREENSHOT_NOT_FOUND' });
  }
  const filePath = path.join(MANUAL_PAYMENT_UPLOAD_DIR, filename);
  const rootPrefix = `${MANUAL_PAYMENT_UPLOAD_DIR}${path.sep}`;
  if (!filePath.startsWith(rootPrefix)) {
    throw new ApiError(404, 'Screenshot not found', { code: 'SCREENSHOT_NOT_FOUND' });
  }
  const ext = path.extname(filename).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  return { filePath, filename, mime };
}

/**
 * @param {{
 *   studentId: number,
 *   orderId: number,
 *   body: Record<string, unknown>,
 *   screenshot: { url: string, sha256: string, storedPath: string },
 * }}
 */
export async function submitManualPayment({ studentId, orderId, body, screenshot }) {
  const fields = parseSubmitManualPaymentFields(body);
  const uid = Number(studentId);
  const oid = Number(orderId);

  const connection = await mysqlPool.getConnection();
  let storedPath = screenshot.storedPath;

  try {
    await connection.beginTransaction();

    const [lockedRows] = await connection.query(
      `SELECT
         o.id,
         o.user_id,
         o.course_id,
         o.enrollment_id,
         o.amount,
         o.currency,
         o.status,
         e.user_id AS enrollment_user_id
       FROM orders o
       INNER JOIN enrollments e ON e.id = o.enrollment_id
       WHERE o.id = ?
       FOR UPDATE`,
      [oid]
    );
    const order = lockedRows[0];
    if (!order) {
      throw new ApiError(404, 'Order not found', { code: 'ORDER_NOT_FOUND' });
    }
    if (Number(order.user_id) !== uid || Number(order.enrollment_user_id) !== uid) {
      throw new ApiError(403, 'You do not have access to this order', { code: 'ORDER_ACCESS_DENIED' });
    }
    if (String(order.status) !== 'pending') {
      throw new ApiError(409, 'This order is not awaiting payment', { code: 'ORDER_NOT_SUBMITTABLE' });
    }

    const [blocking] = await connection.query(
      `SELECT id, status
       FROM manual_payments
       WHERE order_id = ? AND status IN ('pending_review', 'approved')
       LIMIT 1`,
      [oid]
    );
    if (blocking[0]) {
      const status = String(blocking[0].status);
      throw new ApiError(
        400,
        status === 'approved'
          ? 'This order already has a verified payment.'
          : 'You already have a submission under review.',
        { code: status === 'approved' ? 'PAYMENT_ALREADY_SUBMITTED' : 'SUBMISSION_UNDER_REVIEW' }
      );
    }

    const trxRows = await lockAndLoadTransactionIdMatches(connection, fields.transaction_id);

    if (trxRows.some((row) => String(row.status) === 'approved')) {
      throw new ApiError(
        409,
        'This transaction ID has already been used and verified. If you believe this is an error, contact support.',
        { code: 'TRANSACTION_ID_ALREADY_VERIFIED' }
      );
    }

    const pendingTrxMatches = trxRows.filter((row) => String(row.status) === 'pending_review');

    const hashRows = await lockAndLoadScreenshotHashMatches(connection, screenshot.sha256);

    const recentDifferentTrxCount = await countRecentDifferentTransactionIds(
      connection,
      uid,
      fields.transaction_id
    );
    const senderRows = await loadPriorSenderNumbers(connection, uid);

    const [activeAccountRows] = await connection.query(
      `SELECT id
       FROM payment_accounts
       WHERE method = ? AND is_active = TRUE
       ORDER BY id DESC
       LIMIT 1`,
      [fields.payment_method]
    );

    const originalAmount = Number(order.amount);
    const couponRedemption = await redeemCouponForManualPaymentSubmit(connection, {
      couponCode: fields.coupon_code,
      courseId: Number(order.course_id),
      originalAmount,
    });
    const expectedAmount = couponRedemption ? couponRedemption.discountedAmount : originalAmount;

    const risk = computeManualPaymentRisk({
      studentId: uid,
      amountClaimed: fields.amount_claimed,
      expectedAmount,
      pendingTrxMatches: pendingTrxMatches.map((row) => ({ studentId: Number(row.student_id) })),
      screenshotMatches: hashRows.map((row) => ({
        studentId: Number(row.student_id),
        status: String(row.status),
      })),
      recentDifferentTrxCount,
      priorSenderNumbers: senderRows,
      senderPhone: fields.sender_phone_number,
    });

    for (const row of pendingTrxMatches) {
      const nextFlags = parseRiskFlagsJson(row.risk_flags);
      if (!nextFlags.includes(MANUAL_PAYMENT_RISK_FLAGS.DUPLICATE_TRANSACTION_ID_PENDING)) {
        nextFlags.push(MANUAL_PAYMENT_RISK_FLAGS.DUPLICATE_TRANSACTION_ID_PENDING);
      }
      const table =
        row.product === 'standalone_test' ? 'standalone_test_payments' : 'manual_payments';
      await connection.query(
        `UPDATE ${table}
         SET risk_flags = CAST(? AS JSON), risk_level = 'needs_review'
         WHERE id = ?`,
        [JSON.stringify(nextFlags), Number(row.id)]
      );
    }

    const [insertResult] = await connection.query(
      `INSERT INTO manual_payments (
         order_id, enrollment_id, student_id, payment_method,
         sender_phone_number, sender_account_title, transaction_id,
         amount_claimed, screenshot_url, screenshot_file_hash, payment_account_id,
         coupon_id, discount_applied, original_amount,
         status, risk_flags, risk_level
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', CAST(? AS JSON), ?)`,
      [
        oid,
        Number(order.enrollment_id),
        uid,
        fields.payment_method,
        fields.sender_phone_number,
        fields.sender_account_title,
        fields.transaction_id,
        fields.amount_claimed,
        screenshot.url,
        screenshot.sha256,
        activeAccountRows[0]?.id != null ? Number(activeAccountRows[0].id) : null,
        couponRedemption?.couponId ?? null,
        couponRedemption?.discountApplied ?? null,
        couponRedemption ? couponRedemption.originalAmount : null,
        risk.flags.length ? JSON.stringify(risk.flags) : null,
        risk.riskLevel,
      ]
    );

    await connection.commit();
    storedPath = null;

    const created = await findLatestSubmissionForOrder(connection, oid);
    return enrichStudentSubmissionView(created, oid);
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* ignore */
    }
    if (
      error?.code === 'ER_DUP_ENTRY'
      && String(error.sqlMessage || error.message || '').includes('approved_transaction_id')
    ) {
      throw new ApiError(
        409,
        'This transaction ID has already been used and verified. If you believe this is an error, contact support.',
        { code: 'TRANSACTION_ID_ALREADY_VERIFIED' }
      );
    }
    throw error;
  } finally {
    connection.release();
    if (storedPath) {
      await safeUnlink(storedPath);
    }
  }
}

/**
 * Test helper — insert a row with explicit status/risk (does not grant enrollment access).
 */
export async function insertManualPaymentForTests(row) {
  const [result] = await mysqlPool.query(
    `INSERT INTO manual_payments (
       order_id, enrollment_id, student_id, payment_method,
       sender_phone_number, sender_account_title, transaction_id,
       amount_claimed, screenshot_url, screenshot_file_hash, payment_account_id,
       coupon_id, discount_applied, original_amount,
       status, risk_flags, risk_level
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?)`,
    [
      row.orderId,
      row.enrollmentId,
      row.studentId,
      row.paymentMethod,
      row.senderPhone,
      row.senderTitle,
      row.transactionId,
      row.amountClaimed,
      row.screenshotUrl || '/api/uploads/manual-payments/test.png',
      row.screenshotHash || null,
      row.paymentAccountId || null,
      row.couponId ?? null,
      row.discountApplied ?? null,
      row.originalAmount ?? null,
      row.status || 'pending_review',
      row.riskFlags ? JSON.stringify(row.riskFlags) : null,
      row.riskLevel || 'low',
    ]
  );
  return Number(result.insertId);
}

export async function getManualPaymentRowForTests(id) {
  const [rows] = await mysqlPool.query(`SELECT * FROM manual_payments WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

export async function deleteManualPaymentsForTests(ids) {
  if (!ids?.length) return;
  await mysqlPool.query(`DELETE FROM manual_payments WHERE id IN (?)`, [ids]);
}
