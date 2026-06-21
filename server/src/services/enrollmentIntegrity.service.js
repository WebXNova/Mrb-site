/**
 * H-01 — Enrollment integrity: one user + one course = one enrollment row.
 *
 * Simplified model: admission windows, batch seats, and enrollment types are not
 * enforced here — those gates live on courses.admission_status at write time.
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { getEnrollmentById } from './safepayEnrollment.service.js';

const MAX_DEADLOCK_ATTEMPTS = 3;

function normalizePositiveInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ApiError(400, `${label} must be a valid positive integer`);
  }
  return n;
}

function isDeadlockError(error) {
  return error?.code === 'ER_LOCK_DEADLOCK' || error?.errno === 1213;
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {object} payload
 * @returns {Promise<{ id: number, created: boolean }>}
 */
export async function getOrCreateEnrollmentInTransaction(connection, payload) {
  const userId = normalizePositiveInt(payload.userId, 'user_id');
  const courseId = normalizePositiveInt(payload.courseId, 'course_id');
  const provinceId = normalizePositiveInt(payload.provinceId, 'province_id');
  const districtId = normalizePositiveInt(payload.districtId, 'district_id');
  const cityId = normalizePositiveInt(payload.cityId, 'city_id');
  const boardId =
    payload.boardId === undefined || payload.boardId === null || String(payload.boardId).trim() === ''
      ? null
      : normalizePositiveInt(payload.boardId, 'board_id');
  const orderId =
    payload.orderId === undefined || payload.orderId === null || String(payload.orderId).trim() === ''
      ? null
      : normalizePositiveInt(payload.orderId, 'order_id');

  const [existingRows] = await connection.query(
    `SELECT id
     FROM enrollments
     WHERE user_id = ? AND course_id = ?
     FOR UPDATE`,
    [userId, courseId]
  );
  if (existingRows[0]?.id) {
    return { id: Number(existingRows[0].id), created: false };
  }

  const insertParams = [
    userId,
    courseId,
    orderId,
    payload.applicantFullName,
    payload.fatherName,
    payload.dateOfBirth || null,
    payload.gender,
    payload.whatsappNumber,
    payload.email,
    provinceId,
    districtId,
    cityId,
    boardId,
    payload.hsscStatus,
    payload.mdcatAttemptType,
    'pending',
  ];

  try {
    const [result] = await connection.query(
      `INSERT INTO enrollments (
        user_id, course_id, order_id, applicant_full_name, father_name, date_of_birth, gender,
        whatsapp_number, email, province_id, district_id, city_id, board_id,
        hssc_status, mdcat_attempt_type, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      insertParams
    );
    return { id: Number(result.insertId), created: true };
  } catch (error) {
    if (error?.code !== 'ER_DUP_ENTRY') {
      throw error;
    }

    const [dupRows] = await connection.query(
      `SELECT id
       FROM enrollments
       WHERE user_id = ? AND course_id = ?
       FOR UPDATE`,
      [userId, courseId]
    );
    if (!dupRows[0]?.id) {
      throw error;
    }
    return { id: Number(dupRows[0].id), created: false };
  }
}

/**
 * Idempotent enrollment creation — returns the single canonical row for (user, course).
 *
 * @param {object} payload — same shape as legacy createEnrollment
 * @returns {Promise<{ enrollment: object, created: boolean }>}
 */
export async function getOrCreateEnrollment(payload) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_DEADLOCK_ATTEMPTS; attempt += 1) {
    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();
      const { id, created } = await getOrCreateEnrollmentInTransaction(connection, payload);
      await connection.commit();
      const { getEnrollmentById } = await import('./safepayEnrollment.service.js');
      const enrollment = await getEnrollmentById(id);
      if (!enrollment) {
        throw new ApiError(500, 'Enrollment integrity failure: row missing after commit');
      }
      return { enrollment, created };
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // ignore rollback errors
      }
      if (isDeadlockError(error) && attempt < MAX_DEADLOCK_ATTEMPTS) {
        lastError = error;
        continue;
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  throw lastError ?? new ApiError(503, 'Enrollment temporarily unavailable; please retry');
}

/**
 * Lightweight lookup — no row lock, for admission-gate decisions before create.
 *
 * @param {number} userId
 * @param {number} courseId
 * @returns {Promise<object|null>}
 */
export async function findEnrollmentByUserAndCourse(userId, courseId) {
  const uid = normalizePositiveInt(userId, 'user_id');
  const cid = normalizePositiveInt(courseId, 'course_id');
  const [rows] = await mysqlPool.query(
    `SELECT id FROM enrollments WHERE user_id = ? AND course_id = ? LIMIT 1`,
    [uid, cid]
  );
  if (!rows[0]?.id) return null;
  return getEnrollmentById(Number(rows[0].id));
}
