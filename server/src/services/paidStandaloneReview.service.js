import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import {
  explainManualPaymentRiskFlags,
  parseRiskFlagsJson,
} from './manualPaymentRisk.service.js';
import {
  MANUAL_PAYMENT_UPLOAD_DIR,
  resolveStoredScreenshotFilename,
} from './manualPaymentScreenshotUpload.service.js';
import {
  approvePaidStandalonePayment,
  rejectPaidStandalonePayment,
} from './paidStandaloneApproval.service.js';

function mapReviewRow(row) {
  const flags = parseRiskFlagsJson(row.risk_flags);
  return {
    id: Number(row.id),
    orderId: Number(row.order_id),
    studentId: Number(row.student_id),
    studentName: String(row.student_name || row.applicant_name || ''),
    testId: Number(row.test_id),
    testTitle: String(row.test_title || ''),
    slug: String(row.public_slug || ''),
    paymentMethod: String(row.payment_method),
    senderPhoneNumber: String(row.sender_phone_number || ''),
    senderAccountTitle: String(row.sender_account_title || ''),
    transactionId: String(row.transaction_id),
    amountClaimed: Number(row.amount_claimed),
    amountExpected: Number(row.amount_expected),
    status: String(row.status),
    orderStatus: String(row.order_status),
    seatStatus: String(row.seat_status),
    adminNote: row.admin_note ? String(row.admin_note) : null,
    riskLevel: String(row.risk_level || 'low'),
    riskFlags: explainManualPaymentRiskFlags(flags),
    submittedAt: row.created_at ?? null,
    reviewedAt: row.reviewed_at ?? null,
    reviewerName: row.reviewer_name ? String(row.reviewer_name) : null,
    referenceCode: row.reference_code ? String(row.reference_code) : null,
    hasScreenshot: Boolean(resolveStoredScreenshotFilename(row.screenshot_url)),
    product: 'standalone_test',
  };
}

export async function listPaidStandalonePaymentSubmissions({ status = 'pending_review', limit = 50, offset = 0 } = {}) {
  const lim = Math.min(100, Math.max(1, Number(limit) || 50));
  const off = Math.max(0, Number(offset) || 0);
  const params = [];
  let where = '';
  if (status && status !== 'all') {
    where = 'WHERE p.status = ?';
    params.push(status);
  }

  const [rows] = await mysqlPool.query(
    `SELECT p.id, p.order_id, p.student_id, p.payment_method, p.sender_phone_number,
            p.sender_account_title, p.transaction_id, p.amount_claimed, p.status, p.admin_note,
            p.risk_flags, p.risk_level, p.screenshot_url, p.created_at, p.reviewed_at,
            o.amount AS amount_expected, o.status AS order_status, o.seat_status, o.reference_code,
            o.test_id, t.title AS test_title, t.public_slug,
            u.full_name AS student_name, r.applicant_full_name AS applicant_name,
            reviewer.full_name AS reviewer_name
     FROM standalone_test_payments p
     INNER JOIN standalone_test_orders o ON o.id = p.order_id
     INNER JOIN tests t ON t.id = o.test_id
     INNER JOIN users u ON u.id = p.student_id
     INNER JOIN standalone_test_registrations r ON r.id = o.registration_id
     LEFT JOIN users reviewer ON reviewer.id = p.reviewed_by
     ${where}
     ORDER BY p.id DESC
     LIMIT ? OFFSET ?`,
    [...params, lim, off]
  );

  const [countRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n FROM standalone_test_payments p ${where}`,
    params
  );

  return {
    items: rows.map(mapReviewRow),
    total: Number(countRows[0]?.n ?? 0),
    limit: lim,
    offset: off,
  };
}

export async function getPaidStandalonePaymentSubmissionDetail(submissionId) {
  const id = Number(submissionId);
  const [rows] = await mysqlPool.query(
    `SELECT p.*, o.amount AS amount_expected, o.status AS order_status, o.seat_status, o.reference_code,
            o.test_id, t.title AS test_title, t.public_slug,
            u.full_name AS student_name, r.applicant_full_name AS applicant_name,
            reviewer.full_name AS reviewer_name
     FROM standalone_test_payments p
     INNER JOIN standalone_test_orders o ON o.id = p.order_id
     INNER JOIN tests t ON t.id = o.test_id
     INNER JOIN users u ON u.id = p.student_id
     INNER JOIN standalone_test_registrations r ON r.id = o.registration_id
     LEFT JOIN users reviewer ON reviewer.id = p.reviewed_by
     WHERE p.id = ?
     LIMIT 1`,
    [id]
  );
  if (!rows[0]) {
    throw new ApiError(404, 'Payment submission not found', { code: 'SUBMISSION_NOT_FOUND' });
  }
  return mapReviewRow(rows[0]);
}

export async function getPaidStandalonePaymentScreenshotFile(submissionId) {
  const id = Number(submissionId);
  const [rows] = await mysqlPool.query(
    `SELECT screenshot_url FROM standalone_test_payments WHERE id = ? LIMIT 1`,
    [id]
  );
  if (!rows[0]) {
    throw new ApiError(404, 'Payment submission not found', { code: 'SUBMISSION_NOT_FOUND' });
  }
  const filename = resolveStoredScreenshotFilename(rows[0].screenshot_url);
  if (!filename) {
    throw new ApiError(404, 'Screenshot not found', { code: 'SCREENSHOT_NOT_FOUND' });
  }
  return { filename, mime: filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg' };
}

export { approvePaidStandalonePayment, rejectPaidStandalonePayment, MANUAL_PAYMENT_UPLOAD_DIR };
