import { nanoid } from 'nanoid';
import { mysqlPool } from '../config/mysql.js';

function toEnrollment(row) {
  return {
    id: row.id,
    email: row.email,
    applicantFullName: row.applicant_full_name,
    fatherName: row.father_name,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    whatsappNumber: row.whatsapp_number,
    province: row.province,
    district: row.district,
    hsscStatus: row.hssc_status,
    board: row.board,
    mdcatAttemptType: row.mdcat_attempt_type,
    transactionId: row.transaction_id,
    verificationToken: row.verification_token || null,
    paymentMethod: row.payment_method,
    accountTitle: row.account_title,
    receiptUrl: row.receipt_url,
    receiptOriginalName: row.receipt_original_name,
    receiptMimeType: row.receipt_mime_type,
    receiptSizeBytes: row.receipt_size_bytes,
    status: row.status,
    adminNote: row.admin_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function hasDuplicatePendingEnrollment({ email, whatsappNumber }) {
  const [rows] = await mysqlPool.query(
    `SELECT id
     FROM enrollments
     WHERE (LOWER(email) = LOWER(?) OR whatsapp_number = ?)
       AND status = 'pending'
     ORDER BY id DESC
     LIMIT 1`,
    [email, whatsappNumber]
  );
  return Boolean(rows[0]?.id);
}

export async function createEnrollment(payload) {
  const verificationToken = payload.verificationToken || nanoid(32);
  const [result] = await mysqlPool.query(
    `INSERT INTO enrollments (
      email, applicant_full_name, father_name, date_of_birth, gender, whatsapp_number,
      province, district, hssc_status, board, mdcat_attempt_type, transaction_id, verification_token,
      payment_method, account_title, receipt_url, receipt_original_name, receipt_mime_type, receipt_size_bytes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.email,
      payload.applicantFullName,
      payload.fatherName,
      payload.dateOfBirth || null,
      payload.gender,
      payload.whatsappNumber,
      payload.province,
      payload.district,
      payload.hsscStatus,
      payload.board,
      payload.mdcatAttemptType,
      payload.transactionId,
      verificationToken,
      payload.paymentMethod || 'EasyPaisa and JazzCash',
      payload.accountTitle || 'Muzamil Raheem',
      payload.receiptUrl,
      payload.receiptOriginalName || null,
      payload.receiptMimeType || null,
      payload.receiptSizeBytes || null,
    ]
  );
  const [rows] = await mysqlPool.query('SELECT * FROM enrollments WHERE id = ?', [result.insertId]);
  return rows[0] ? toEnrollment(rows[0]) : null;
}

export async function listEnrollments() {
  const [rows] = await mysqlPool.query('SELECT * FROM enrollments ORDER BY submitted_at DESC, id DESC');
  return rows.map(toEnrollment);
}

export async function getEnrollmentById(id) {
  const [rows] = await mysqlPool.query('SELECT * FROM enrollments WHERE id = ?', [id]);
  if (!rows[0]) return null;
  return toEnrollment(rows[0]);
}

export async function getEnrollmentTrackingByToken(token) {
  if (!token || String(token).length < 16) return null;
  const [rows] = await mysqlPool.query(
    `SELECT applicant_full_name, status, submitted_at, reviewed_at
     FROM enrollments
     WHERE verification_token = ?
     LIMIT 1`,
    [token]
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    applicantFullName: row.applicant_full_name,
    status: row.status,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
  };
}

export async function updateEnrollmentStatus({ enrollmentId, status, adminNote, reviewedBy }) {
  await mysqlPool.query(
    `UPDATE enrollments
     SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [status, adminNote || null, reviewedBy || null, enrollmentId]
  );
  return getEnrollmentById(enrollmentId);
}
