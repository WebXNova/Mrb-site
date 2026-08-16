/**
 * Admin review of student manual payment proofs.
 * Does not grant access except by calling activateEnrollmentInTransaction
 * with the same paid-order contract as the Safepay webhook.
 */

import path from 'path';
import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { ENROLLMENT_SOURCE } from '../constants/enrollmentSource.js';
import { activateEnrollmentInTransaction } from './enrollmentLifecycle.service.js';
import { markOrderPaidFromPending } from './orderCheckoutIntegrity.service.js';
import { logActivity } from './activityLog.service.js';
import {
  explainManualPaymentRiskFlags,
  parseRiskFlagsJson,
} from './manualPaymentRisk.service.js';
import { resolveManualPaymentExpectedAmount } from './couponRedemption.service.js';
import {
  MANUAL_PAYMENT_UPLOAD_DIR,
  resolveStoredScreenshotFilename,
} from './manualPaymentScreenshotUpload.service.js';

const LIST_SELECT = `
  mp.id,
  mp.order_id,
  mp.enrollment_id,
  mp.student_id,
  mp.payment_method,
  mp.sender_phone_number,
  mp.sender_account_title,
  mp.transaction_id,
  mp.amount_claimed,
  mp.screenshot_url,
  mp.status,
  mp.admin_note,
  mp.reviewed_by,
  mp.reviewed_at,
  mp.risk_flags,
  mp.risk_level,
  mp.coupon_id,
  mp.discount_applied,
  mp.original_amount,
  cp.code AS coupon_code,
  cp.discount_type AS coupon_discount_type,
  mp.created_at,
  mp.updated_at,
  o.amount AS amount_expected,
  o.currency,
  o.status AS order_status,
  o.reference_code,
  o.course_id,
  u.full_name AS student_name,
  e.applicant_full_name AS applicant_name,
  c.title AS course_name,
  reviewer.full_name AS reviewer_name
`;

const LIST_FROM = `
  FROM manual_payments mp
  INNER JOIN orders o ON o.id = mp.order_id
  INNER JOIN enrollments e ON e.id = mp.enrollment_id
  INNER JOIN users u ON u.id = mp.student_id
  INNER JOIN courses c ON c.id = o.course_id
  LEFT JOIN users reviewer ON reviewer.id = mp.reviewed_by
  LEFT JOIN coupons cp ON cp.id = mp.coupon_id
`;

function mapReviewRow(row) {
  const flags = parseRiskFlagsJson(row.risk_flags);
  const amountClaimed = Number(row.amount_claimed);
  const amountExpected = resolveManualPaymentExpectedAmount(row);
  return {
    id: Number(row.id),
    orderId: Number(row.order_id),
    enrollmentId: Number(row.enrollment_id),
    studentId: Number(row.student_id),
    studentName: String(row.student_name || row.applicant_name || ''),
    courseId: Number(row.course_id),
    courseName: String(row.course_name || ''),
    paymentMethod: String(row.payment_method),
    senderPhoneNumber: String(row.sender_phone_number || ''),
    senderAccountTitle: String(row.sender_account_title || ''),
    transactionId: String(row.transaction_id || ''),
    amountClaimed,
    amountExpected,
    amountMismatch: amountClaimed !== amountExpected,
    couponId: row.coupon_id == null ? null : Number(row.coupon_id),
    couponCode: row.coupon_code ? String(row.coupon_code) : null,
    couponDiscountType:
      row.coupon_discount_type === 'flat' || row.coupon_discount_type === 'percentage'
        ? row.coupon_discount_type
        : null,
    discountApplied: row.discount_applied == null ? null : Number(row.discount_applied),
    originalAmount: row.original_amount == null ? null : Number(row.original_amount),
    currency: String(row.currency || 'PKR'),
    screenshotUrl: row.screenshot_url ? String(row.screenshot_url) : null,
    hasScreenshot: Boolean(resolveStoredScreenshotFilename(row.screenshot_url)),
    riskFlags: flags,
    riskFlagLabels: explainManualPaymentRiskFlags(flags),
    riskLevel: String(row.risk_level || 'low'),
    status: String(row.status),
    adminNote: row.admin_note ? String(row.admin_note) : null,
    reviewedBy: row.reviewed_by == null ? null : Number(row.reviewed_by),
    reviewerName: row.reviewer_name ? String(row.reviewer_name) : null,
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    orderStatus: String(row.order_status || ''),
    referenceCode: row.reference_code ? String(row.reference_code) : null,
  };
}

function parseId(raw, label = 'submission') {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, `Invalid ${label} id`);
  }
  return id;
}

/**
 * @param {ReturnType<import('../validators/manualPaymentReview.schema.js').parseManualPaymentReviewListQuery>} filters
 */
export async function listManualPaymentSubmissions(filters) {
  const where = [];
  const params = [];

  if (filters.status && filters.status !== 'all') {
    where.push('mp.status = ?');
    params.push(filters.status);
  }
  if (filters.riskLevel && filters.riskLevel !== 'all') {
    where.push('mp.risk_level = ?');
    params.push(filters.riskLevel);
  }
  if (filters.courseId) {
    where.push('o.course_id = ?');
    params.push(filters.courseId);
  }
  if (filters.dateFrom) {
    where.push('mp.created_at >= ?');
    params.push(`${filters.dateFrom} 00:00:00`);
  }
  if (filters.dateTo) {
    where.push('mp.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(filters.dateTo);
  }
  if (filters.search) {
    const like = `%${filters.search}%`;
    where.push(
      '(mp.transaction_id LIKE ? OR u.full_name LIKE ? OR e.applicant_full_name LIKE ?)'
    );
    params.push(like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[countRow]] = await mysqlPool.query(
    `SELECT COUNT(*) AS n ${LIST_FROM} ${whereSql}`,
    params
  );

  const [rows] = await mysqlPool.query(
    `SELECT ${LIST_SELECT}
     ${LIST_FROM}
     ${whereSql}
     ORDER BY
       CASE WHEN mp.risk_level = 'needs_review' THEN 0 ELSE 1 END ASC,
       mp.created_at ASC,
       mp.id ASC
     LIMIT ? OFFSET ?`,
    [...params, filters.limit, filters.offset]
  );

  const stats = await getManualPaymentReviewStats();

  return {
    items: rows.map(mapReviewRow),
    total: Number(countRow?.n ?? 0),
    limit: filters.limit,
    offset: filters.offset,
    stats,
  };
}

export async function getManualPaymentReviewStats() {
  const [[row]] = await mysqlPool.query(
    `SELECT
       SUM(status = 'pending_review') AS pending,
       SUM(status = 'pending_review' AND risk_level = 'needs_review') AS needs_review,
       SUM(status = 'approved' AND reviewed_at >= CURDATE() AND reviewed_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)) AS approved_today,
       SUM(status = 'rejected' AND reviewed_at >= CURDATE() AND reviewed_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)) AS rejected_today
     FROM manual_payments`
  );
  return {
    pending: Number(row?.pending ?? 0),
    needsReview: Number(row?.needs_review ?? 0),
    approvedToday: Number(row?.approved_today ?? 0),
    rejectedToday: Number(row?.rejected_today ?? 0),
  };
}

export async function getManualPaymentSubmissionDetail(submissionId) {
  const id = parseId(submissionId);
  const [rows] = await mysqlPool.query(
    `SELECT ${LIST_SELECT} ${LIST_FROM} WHERE mp.id = ? LIMIT 1`,
    [id]
  );
  const row = rows[0];
  if (!row) {
    throw new ApiError(404, 'Payment submission not found', { code: 'SUBMISSION_NOT_FOUND' });
  }

  const [historyRows] = await mysqlPool.query(
    `SELECT ${LIST_SELECT}
     ${LIST_FROM}
     WHERE mp.order_id = ? AND mp.id <> ?
     ORDER BY mp.created_at DESC, mp.id DESC`,
    [Number(row.order_id), id]
  );

  return {
    ...mapReviewRow(row),
    history: historyRows.map(mapReviewRow),
  };
}

/**
 * Resolve on-disk screenshot for an admin download. Never serves a public URL.
 * @param {number} submissionId
 * @returns {Promise<{ filePath: string, filename: string, mime: string }>}
 */
export async function getManualPaymentScreenshotFile(submissionId) {
  const id = parseId(submissionId);
  const [rows] = await mysqlPool.query(
    `SELECT screenshot_url FROM manual_payments WHERE id = ? LIMIT 1`,
    [id]
  );
  const row = rows[0];
  if (!row) {
    throw new ApiError(404, 'Payment submission not found', { code: 'SUBMISSION_NOT_FOUND' });
  }
  const filename = resolveStoredScreenshotFilename(row.screenshot_url);
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

async function loadPendingSubmissionForUpdate(connection, submissionId) {
  const [rows] = await connection.query(
    `SELECT
       id,
       order_id,
       enrollment_id,
       student_id,
       transaction_id,
       payment_method,
       status
     FROM manual_payments
     WHERE id = ?
     FOR UPDATE`,
    [submissionId]
  );
  const row = rows[0];
  if (!row) {
    throw new ApiError(404, 'Payment submission not found', { code: 'SUBMISSION_NOT_FOUND' });
  }
  return row;
}

function assertPendingReview(row) {
  if (String(row.status) !== 'pending_review') {
    throw new ApiError(409, 'This submission has already been processed.', {
      code: 'SUBMISSION_ALREADY_PROCESSED',
      status: String(row.status),
    });
  }
}

function isApprovedTransactionIdDuplicateError(error) {
  return (
    error?.code === 'ER_DUP_ENTRY'
    && String(error.sqlMessage || error.message || '').includes('approved_transaction_id')
  );
}

function isDeadlockError(error) {
  return error?.code === 'ER_LOCK_DEADLOCK' || error?.errno === 1213;
}

const APPROVE_DEADLOCK_MAX_ATTEMPTS = 3;

/**
 * Defense-in-depth: submission row must belong to the locked order before activation.
 * @param {Record<string, unknown>} row — locked manual_payments row
 * @param {Record<string, unknown>} order — locked orders row
 */
function assertSubmissionOrderIntegrity(row, order) {
  const submissionStudentId = Number(row.student_id);
  const orderUserId = Number(order.user_id);
  const submissionEnrollmentId = Number(row.enrollment_id);
  const orderEnrollmentId = Number(order.enrollment_id);

  if (submissionStudentId !== orderUserId) {
    throw new ApiError(409, 'Payment submission does not match the order owner.', {
      code: 'MANUAL_PAYMENT_ORDER_MISMATCH',
      reason: 'student_id_mismatch',
      submissionId: Number(row.id),
      orderId: Number(order.id),
    });
  }
  if (submissionEnrollmentId !== orderEnrollmentId) {
    throw new ApiError(409, 'Payment submission does not match the order enrollment.', {
      code: 'MANUAL_PAYMENT_ORDER_MISMATCH',
      reason: 'enrollment_id_mismatch',
      submissionId: Number(row.id),
      orderId: Number(order.id),
    });
  }
}

/**
 * Block approve when the same TRX is already approved on a different submission.
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {string} transactionId
 * @param {number} submissionId
 */
async function assertTransactionIdNotAlreadyApprovedElsewhere(connection, transactionId, submissionId) {
  const trx = String(transactionId || '').trim();
  if (!trx) return;

  const [rows] = await connection.query(
    `SELECT id
     FROM manual_payments
     WHERE transaction_id = ? AND status = 'approved' AND id <> ?
     LIMIT 1`,
    [trx, submissionId]
  );
  if (rows[0]) {
    throw new ApiError(409, 'This transaction ID has already been approved on another submission.', {
      code: 'TRANSACTION_ID_ALREADY_APPROVED_ELSEWHERE',
      approvedSubmissionId: Number(rows[0].id),
    });
  }
}

function logManualPaymentSecurityEvent(input) {
  void logActivity({
    userId: input.actorId,
    role: typeof input.actorRole === 'string' ? input.actorRole : 'admin',
    action: input.action,
    entityType: 'manual_payment',
    entityId: String(input.submissionId),
    metadata: input.metadata,
  });
}

/**
 * @param {{ submissionId: number, actorId: number, actorRole: string }} input
 */
export async function approveManualPaymentSubmission(input) {
  const submissionId = parseId(input.submissionId);
  const actorId = Number(input.actorId);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }

  let approvedOrderId = null;
  let approvedEnrollmentId = null;

  for (let attempt = 1; attempt <= APPROVE_DEADLOCK_MAX_ATTEMPTS; attempt += 1) {
    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();

      const row = await loadPendingSubmissionForUpdate(connection, submissionId);
      assertPendingReview(row);

      const [orderRows] = await connection.query(
        `SELECT id, status, user_id, course_id, enrollment_id
         FROM orders
         WHERE id = ?
         FOR UPDATE`,
        [Number(row.order_id)]
      );
      const order = orderRows[0];
      if (!order) {
        throw new ApiError(404, 'Order not found', { code: 'ORDER_NOT_FOUND' });
      }
      if (String(order.status) !== 'pending') {
        throw new ApiError(409, 'This order is no longer awaiting payment.', {
          code: 'ORDER_NOT_PENDING',
        });
      }

      try {
        assertSubmissionOrderIntegrity(row, order);
      } catch (error) {
        if (error instanceof ApiError && error.code === 'MANUAL_PAYMENT_ORDER_MISMATCH') {
          logManualPaymentSecurityEvent({
            submissionId,
            actorId,
            actorRole: input.actorRole,
            action: 'admin.manual_payment.order_mismatch_blocked',
            metadata: {
              submissionId,
              orderId: Number(order.id),
              reason: error.details?.reason ?? 'unknown',
              submissionStudentId: Number(row.student_id),
              orderUserId: Number(order.user_id),
              submissionEnrollmentId: Number(row.enrollment_id),
              orderEnrollmentId: Number(order.enrollment_id),
            },
          });
        }
        throw error;
      }

      await assertTransactionIdNotAlreadyApprovedElsewhere(
        connection,
        row.transaction_id,
        submissionId
      );

      const [updateResult] = await connection.query(
        `UPDATE manual_payments
         SET status = 'approved',
             reviewed_by = ?,
             reviewed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending_review'`,
        [actorId, submissionId]
      );
      if (Number(updateResult?.affectedRows ?? 0) === 0) {
        throw new ApiError(409, 'This submission has already been processed.', {
          code: 'SUBMISSION_ALREADY_PROCESSED',
        });
      }

      const payloadJsonStr = JSON.stringify({
        source: 'manual_payment',
        manualPaymentId: submissionId,
        transactionId: row.transaction_id,
        paymentMethod: row.payment_method,
        reviewedBy: actorId,
      });
      const gatewayRefForDb = `manual:${submissionId}`.slice(0, 120);
      const trxId = String(row.transaction_id || '').slice(0, 255);

      const affected = await markOrderPaidFromPending(connection, {
        orderId: Number(order.id),
        gatewayRefForDb,
        safepayTxnForDb: trxId || null,
        rawTrackerSlice: '',
        payloadJsonStr,
      });
      if (affected === 0) {
        throw new ApiError(409, 'This order is no longer awaiting payment.', {
          code: 'ORDER_NOT_PENDING',
        });
      }

      approvedOrderId = Number(order.id);
      approvedEnrollmentId = Number(row.enrollment_id);

      await activateEnrollmentInTransaction(connection, {
        enrollmentId: approvedEnrollmentId,
        orderId: approvedOrderId,
        actor: 'admin.manual_approval',
        reason: 'manual_payment_approved',
        requirePaidOrder: true,
        enrollmentSource: ENROLLMENT_SOURCE.PAID,
      });

      await connection.commit();
      break;
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        /* ignore */
      }
      if (isApprovedTransactionIdDuplicateError(error)) {
        logManualPaymentSecurityEvent({
          submissionId,
          actorId,
          actorRole: input.actorRole,
          action: 'admin.manual_payment.duplicate_transaction_id_blocked',
          metadata: {
            submissionId,
            reason: 'approved_transaction_id_unique_constraint',
          },
        });
        throw new ApiError(409, 'This transaction ID has already been approved on another submission.', {
          code: 'TRANSACTION_ID_ALREADY_APPROVED_ELSEWHERE',
        });
      }
      if (isDeadlockError(error) && attempt < APPROVE_DEADLOCK_MAX_ATTEMPTS) {
        continue;
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  void logActivity({
    userId: actorId,
    role: typeof input.actorRole === 'string' ? input.actorRole : 'admin',
    action: 'admin.manual_payment.approved',
    entityType: 'manual_payment',
    entityId: String(submissionId),
    metadata: {
      submissionId,
      orderId: approvedOrderId,
      enrollmentId: approvedEnrollmentId,
    },
  });

  return getManualPaymentSubmissionDetail(submissionId);
}

/**
 * @param {{ submissionId: number, actorId: number, actorRole: string, adminNote: string }} input
 */
export async function rejectManualPaymentSubmission(input) {
  const submissionId = parseId(input.submissionId);
  const actorId = Number(input.actorId);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }
  const adminNote = String(input.adminNote || '').trim();
  if (adminNote.length < 3) {
    throw new ApiError(400, 'A rejection reason is required', { code: 'REJECTION_REASON_REQUIRED' });
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const row = await loadPendingSubmissionForUpdate(connection, submissionId);
    assertPendingReview(row);

    const [updateResult] = await connection.query(
      `UPDATE manual_payments
       SET status = 'rejected',
           admin_note = ?,
           reviewed_by = ?,
           reviewed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending_review'`,
      [adminNote, actorId, submissionId]
    );
    if (Number(updateResult?.affectedRows ?? 0) === 0) {
      throw new ApiError(409, 'This submission has already been processed.', {
        code: 'SUBMISSION_ALREADY_PROCESSED',
      });
    }

    await connection.commit();
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

  void logActivity({
    userId: actorId,
    role: typeof input.actorRole === 'string' ? input.actorRole : 'admin',
    action: 'admin.manual_payment.rejected',
    entityType: 'manual_payment',
    entityId: String(submissionId),
    metadata: {
      submissionId,
    },
  });

  return getManualPaymentSubmissionDetail(submissionId);
}
