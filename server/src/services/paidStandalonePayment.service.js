/**
 * Paid standalone JazzCash/EasyPaisa proofs — reuses computeManualPaymentRisk
 * and shared TRX/hash lookups. No coupons. No course orders/enrollments.
 */

import path from 'path';
import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { parseSubmitManualPaymentFields } from '../validators/manualPayment.schema.js';
import {
  computeManualPaymentRisk,
  parseRiskFlagsJson,
  toStudentManualPaymentView,
  MANUAL_PAYMENT_RISK_FLAGS,
} from './manualPaymentRisk.service.js';
import {
  countRecentDifferentTransactionIds,
  loadPriorSenderNumbers,
  lockAndLoadScreenshotHashMatches,
  lockAndLoadTransactionIdMatches,
} from './manualPaymentFraudLookup.service.js';
import {
  MANUAL_PAYMENT_UPLOAD_DIR,
  resolveStoredScreenshotFilename,
  safeUnlink,
} from './manualPaymentScreenshotUpload.service.js';
import {
  STANDALONE_ORDER_STATUS,
  STANDALONE_PAYMENT_STATUS,
} from '../constants/paidStandalone.constants.js';
import { countConfirmedStandaloneSeats } from './paidStandaloneApproval.service.js';

export async function loadOwnedStandaloneOrder(orderId, studentId, connection = mysqlPool) {
  const id = Number(orderId);
  const uid = Number(studentId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid order id');
  }
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new ApiError(401, 'Authentication required');
  }

  const [rows] = await connection.query(
    `SELECT o.id, o.user_id, o.test_id, o.registration_id, o.amount, o.currency, o.status,
            o.reference_code, t.price_pkr, t.title AS test_title, t.public_slug, t.seat_capacity
     FROM standalone_test_orders o
     INNER JOIN tests t ON t.id = o.test_id
     WHERE o.id = ?
     LIMIT 1`,
    [id]
  );
  const row = rows[0];
  if (!row) {
    throw new ApiError(404, 'Order not found', { code: 'ORDER_NOT_FOUND' });
  }
  if (Number(row.user_id) !== uid) {
    throw new ApiError(403, 'You do not have access to this order', { code: 'ORDER_ACCESS_DENIED' });
  }
  return row;
}

async function findLatestStandaloneSubmission(connection, orderId) {
  const [rows] = await connection.query(
    `SELECT p.id, p.order_id, p.status, p.transaction_id, p.amount_claimed, p.payment_method,
            p.sender_phone_number, p.sender_account_title, p.screenshot_url, p.created_at, p.admin_note
     FROM standalone_test_payments p
     WHERE p.order_id = ?
     ORDER BY p.id DESC
     LIMIT 1`,
    [orderId]
  );
  return rows[0] ?? null;
}

export async function getPaidStandaloneCheckoutInfo({ studentId, orderId }) {
  const order = await loadOwnedStandaloneOrder(orderId, studentId);
  if (String(order.status) !== STANDALONE_ORDER_STATUS.PENDING) {
    throw new ApiError(409, 'This order is not awaiting payment', { code: 'ORDER_NOT_SUBMITTABLE' });
  }

  const [accounts] = await mysqlPool.query(
    `SELECT id, method, account_number, account_title
     FROM payment_accounts
     WHERE is_active = TRUE
     ORDER BY method ASC, id ASC`
  );
  if (!accounts.length) {
    throw new ApiError(503, 'Payment temporarily unavailable, please contact support', {
      code: 'PAYMENT_UNAVAILABLE',
    });
  }

  return {
    orderId: Number(order.id),
    amount: Number(order.price_pkr),
    currency: String(order.currency || 'PKR'),
    referenceCode: order.reference_code ? String(order.reference_code) : null,
    testTitle: String(order.test_title || ''),
    slug: String(order.public_slug || ''),
    couponsSupported: false,
    accounts: accounts.map((row) => ({
      id: Number(row.id),
      method: row.method,
      accountNumber: row.account_number,
      accountTitle: row.account_title,
    })),
  };
}

export async function getPaidStandalonePaymentStatus({ studentId, orderId }) {
  const order = await loadOwnedStandaloneOrder(orderId, studentId);
  const latest = await findLatestStandaloneSubmission(mysqlPool, orderId);
  const view = toStudentManualPaymentView(latest);
  return {
    ...view,
    orderStatus: String(order.status),
    amount: Number(order.price_pkr),
    referenceCode: order.reference_code ? String(order.reference_code) : null,
    seatConfirmed: String(order.status) === STANDALONE_ORDER_STATUS.APPROVED,
  };
}

export async function getPaidStandaloneScreenshotForStudent({ studentId, orderId }) {
  const oid = Number(orderId);
  await loadOwnedStandaloneOrder(oid, studentId);
  const latest = await findLatestStandaloneSubmission(mysqlPool, oid);
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

export async function submitPaidStandalonePayment({ studentId, orderId, body, screenshot }) {
  const fields = parseSubmitManualPaymentFields(body);
  if (fields.coupon_code) {
    throw new ApiError(422, 'Coupons are not available for standalone tests', {
      code: 'COUPON_NOT_SUPPORTED',
    });
  }

  const uid = Number(studentId);
  const oid = Number(orderId);
  const connection = await mysqlPool.getConnection();
  let storedPath = screenshot.storedPath;

  try {
    await connection.beginTransaction();

    const [locked] = await connection.query(
      `SELECT o.id, o.user_id, o.test_id, o.amount, o.status, t.price_pkr, t.seat_capacity
       FROM standalone_test_orders o
       INNER JOIN tests t ON t.id = o.test_id
       WHERE o.id = ?
       FOR UPDATE`,
      [oid]
    );
    const order = locked[0];
    if (!order) {
      throw new ApiError(404, 'Order not found', { code: 'ORDER_NOT_FOUND' });
    }
    if (Number(order.user_id) !== uid) {
      throw new ApiError(403, 'You do not have access to this order', { code: 'ORDER_ACCESS_DENIED' });
    }
    if (String(order.status) !== STANDALONE_ORDER_STATUS.PENDING) {
      throw new ApiError(409, 'This order is not awaiting payment', { code: 'ORDER_NOT_SUBMITTABLE' });
    }

    const expectedAmount = Number(order.price_pkr);
    if (Number(order.amount) !== expectedAmount) {
      throw new ApiError(409, 'Order amount is invalid', { code: 'AMOUNT_MISMATCH' });
    }

    const capacity = Number(order.seat_capacity);
    const confirmed = await countConfirmedStandaloneSeats(connection, Number(order.test_id));
    if (Number.isInteger(capacity) && capacity > 0 && confirmed >= capacity) {
      throw new ApiError(409, 'This test has no remaining seats', { code: 'CAPACITY_REACHED' });
    }

    const [blocking] = await connection.query(
      `SELECT id, status
       FROM standalone_test_payments
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
    if (trxRows.some((row) => String(row.status) === STANDALONE_PAYMENT_STATUS.APPROVED)) {
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
    const priorSenderNumbers = await loadPriorSenderNumbers(connection, uid);

    const [activeAccountRows] = await connection.query(
      `SELECT id FROM payment_accounts WHERE method = ? AND is_active = TRUE ORDER BY id DESC LIMIT 1`,
      [fields.payment_method]
    );

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
      priorSenderNumbers,
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

    await connection.query(
      `INSERT INTO standalone_test_payments (
         order_id, student_id, payment_method,
         sender_phone_number, sender_account_title, transaction_id,
         amount_claimed, screenshot_url, screenshot_file_hash, payment_account_id,
         status, risk_flags, risk_level
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', CAST(? AS JSON), ?)`,
      [
        oid,
        uid,
        fields.payment_method,
        fields.sender_phone_number,
        fields.sender_account_title,
        fields.transaction_id,
        fields.amount_claimed,
        screenshot.url,
        screenshot.sha256,
        activeAccountRows[0]?.id != null ? Number(activeAccountRows[0].id) : null,
        risk.flags.length ? JSON.stringify(risk.flags) : null,
        risk.riskLevel,
      ]
    );

    await connection.query(
      `UPDATE standalone_test_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [STANDALONE_ORDER_STATUS.UNDER_REVIEW, oid]
    );

    await connection.commit();
    storedPath = null;

    const created = await findLatestStandaloneSubmission(mysqlPool, oid);
    return toStudentManualPaymentView(created);
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* ignore */
    }
    if (
      error?.code === 'ER_DUP_ENTRY' &&
      String(error.sqlMessage || error.message || '').includes('approved_transaction_id')
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
