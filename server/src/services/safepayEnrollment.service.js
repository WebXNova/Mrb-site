import { mysqlPool } from '../config/mysql.js';
import { ENROLLMENT_SOURCE } from '../constants/enrollmentSource.js';
import { ApiError } from '../utils/apiError.js';
import { getOrCreateEnrollment } from './enrollmentIntegrity.service.js';
import { activateEnrollment, revokeEnrollment } from './enrollmentLifecycle.service.js';
import { resolveHierarchyCourseScope } from '../utils/parseAdminListFilters.js';

function normalizePositiveInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ApiError(400, `${label} must be a valid positive integer`);
  }
  return n;
}

function parseOptionalPositiveInt(value, label) {
  if (value == null || String(value).trim() === '') return null;
  return normalizePositiveInt(value, label);
}

function normalizeStatus(status) {
  const value = String(status || 'pending').trim().toLowerCase();
  if (value === 'verified') return 'approved';
  if (['pending', 'approved', 'rejected'].includes(value)) return value;
  throw new ApiError(400, 'Invalid enrollment status');
}

function toEnrollment(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    userFullName: row.user_full_name || null,
    userEmail: row.user_email || null,
    userAccountStatus: row.user_account_status || null,
    courseId: row.course_id,
    courseTitle: row.course_title || null,
    courseSlug: row.course_slug || null,
    orderId: row.order_id ?? null,
    orderStatus: row.order_status || null,
    orderGateway: row.order_gateway || null,
    orderGatewayRef: row.order_gateway_ref || null,
    orderAmount: row.order_amount ?? null,
    orderCurrency: row.order_currency || null,
    orderPaidAt: row.order_paid_at || null,
    applicantFullName: row.applicant_full_name,
    fatherName: row.father_name,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    whatsappNumber: row.whatsapp_number,
    email: row.email,
    provinceId: row.province_id,
    province: row.province_name || null,
    provinceSlug: row.province_slug || null,
    districtId: row.district_id,
    district: row.district_name || null,
    districtSlug: row.district_slug || null,
    cityId: row.city_id,
    city: row.city_name || null,
    citySlug: row.city_slug || null,
    boardId: row.board_id ?? null,
    board: row.board_name || null,
    boardSlug: row.board_slug || null,
    hsscStatus: row.hssc_status,
    mdcatAttemptType: row.mdcat_attempt_type,
    status: row.status,
    accessStatus: row.access_status ?? 'inactive',
    enrollmentSource: row.enrollment_source ?? null,
    adminNote: row.admin_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    submittedAt: row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function selectEnrollmentSql(whereSql = '1 = 1') {
  return `
    SELECT
      e.id,
      e.user_id,
      u.full_name AS user_full_name,
      u.email AS user_email,
      u.status AS user_account_status,
      e.course_id,
      c.title AS course_title,
      c.slug AS course_slug,
      e.order_id,
      o.status AS order_status,
      o.gateway AS order_gateway,
      o.gateway_order_ref AS order_gateway_ref,
      o.amount AS order_amount,
      o.currency AS order_currency,
      o.paid_at AS order_paid_at,
      e.applicant_full_name,
      e.father_name,
      e.date_of_birth,
      e.gender,
      e.whatsapp_number,
      e.email,
      e.province_id,
      p.name AS province_name,
      p.slug AS province_slug,
      e.district_id,
      ds.name AS district_name,
      ds.slug AS district_slug,
      e.city_id,
      ct.name AS city_name,
      ct.slug AS city_slug,
      e.board_id,
      b.name AS board_name,
      b.slug AS board_slug,
      e.hssc_status,
      e.mdcat_attempt_type,
      e.status,
      e.access_status,
      e.enrollment_source,
      e.admin_note,
      e.reviewed_by,
      e.reviewed_at,
      e.created_at,
      e.updated_at
    FROM enrollments e
    INNER JOIN users u ON u.id = e.user_id
    INNER JOIN courses c ON c.id = e.course_id
    LEFT JOIN orders o ON o.id = e.order_id
    LEFT JOIN provinces p ON p.id = e.province_id
    LEFT JOIN districts ds ON ds.id = e.district_id
    LEFT JOIN cities ct ON ct.id = e.city_id
    LEFT JOIN intermediate_boards b ON b.id = e.board_id
    WHERE ${whereSql}
  `;
}

async function fetchEnrollmentRows(whereSql, params, orderBy = 'e.created_at DESC, e.id DESC') {
  const [rows] = await mysqlPool.query(`${selectEnrollmentSql(whereSql)} ORDER BY ${orderBy}`, params);
  return rows.map(toEnrollment);
}

async function fetchEnrollmentRowById(id) {
  const rows = await fetchEnrollmentRows('e.id = ?', [id], 'e.id DESC');
  return rows[0] || null;
}

async function assertReferenceExists(table, id, label, columns = 'id') {
  const numericId = normalizePositiveInt(id, label);
  const [rows] = await mysqlPool.query(
    `SELECT ${columns}
     FROM ${table}
     WHERE id = ?
     LIMIT 1`,
    [numericId]
  );
  if (!rows[0]) {
    throw new ApiError(400, `${label} is invalid or inactive`);
  }
  return rows[0];
}

export async function assertCourseExists(courseId) {
  return assertReferenceExists('courses', courseId, 'course_id', 'id');
}

export async function assertBoardExists(boardId) {
  if (boardId === undefined || boardId === null || String(boardId).trim() === '') return null;
  return assertReferenceExists('intermediate_boards', boardId, 'board_id', 'id, name, slug');
}

export async function assertOrderExists(orderId) {
  if (orderId === undefined || orderId === null || String(orderId).trim() === '') return null;
  return assertReferenceExists('orders', orderId, 'order_id', 'id, status');
}

export async function hasDuplicatePendingEnrollment({ userId, courseId }) {
  const [rows] = await mysqlPool.query(
    `SELECT id
     FROM enrollments
     WHERE user_id = ? AND course_id = ? AND status = 'pending'
     ORDER BY id DESC
     LIMIT 1`,
    [normalizePositiveInt(userId, 'user_id'), normalizePositiveInt(courseId, 'course_id')]
  );
  return Boolean(rows[0]?.id);
}

/** @deprecated Prefer getOrCreateEnrollment — retained for internal callers. */
export async function createEnrollment(payload) {
  const { enrollment } = await getOrCreateEnrollment(payload);
  return enrollment;
}

function assertIsoDate(value, label) {
  if (!value) return undefined;
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new ApiError(400, `Invalid ${label} (use YYYY-MM-DD)`);
  }
  return s;
}

export async function listEnrollments(filters = {}) {
  const conditions = ['1 = 1'];
  const params = [];

  const statusRaw =
    filters.status !== undefined && filters.status !== null
      ? String(filters.status).trim().toLowerCase()
      : 'all';
  if (statusRaw && statusRaw !== 'all') {
    const status = normalizeStatus(statusRaw);
    conditions.push('e.status = ?');
    params.push(status);
  }

  const provinceIdRaw = filters.province_id ?? filters.provinceId;
  const provinceNameRaw = filters.province;
  if (provinceIdRaw !== undefined && provinceIdRaw !== null && String(provinceIdRaw).trim() !== '') {
    conditions.push('e.province_id = ?');
    params.push(normalizePositiveInt(provinceIdRaw, 'province_id'));
  } else if (provinceNameRaw !== undefined && String(provinceNameRaw).trim() !== '' && String(provinceNameRaw).trim() !== 'all') {
    conditions.push('p.name = ?');
    params.push(String(provinceNameRaw).trim());
  }

  const districtIdRaw = filters.district_id ?? filters.districtId;
  if (districtIdRaw !== undefined && districtIdRaw !== null && String(districtIdRaw).trim() !== '') {
    conditions.push('e.district_id = ?');
    params.push(normalizePositiveInt(districtIdRaw, 'district_id'));
  }

  const cityIdRaw = filters.city_id ?? filters.cityId;
  if (cityIdRaw !== undefined && cityIdRaw !== null && String(cityIdRaw).trim() !== '') {
    conditions.push('e.city_id = ?');
    params.push(normalizePositiveInt(cityIdRaw, 'city_id'));
  }

  const boardIdRaw = filters.board_id ?? filters.boardId;
  const boardNameRaw = filters.board;
  if (boardIdRaw !== undefined && boardIdRaw !== null && String(boardIdRaw).trim() !== '') {
    conditions.push('e.board_id = ?');
    params.push(normalizePositiveInt(boardIdRaw, 'board_id'));
  } else if (boardNameRaw !== undefined && String(boardNameRaw).trim() !== '' && String(boardNameRaw).trim() !== 'all') {
    conditions.push('b.name = ?');
    params.push(String(boardNameRaw).trim());
  }

  let courseId = parseOptionalPositiveInt(filters.course_id ?? filters.courseId, 'course_id');
  const subjectId = parseOptionalPositiveInt(filters.subject_id ?? filters.subjectId, 'subject_id');
  const chapterId = parseOptionalPositiveInt(filters.chapter_id ?? filters.chapterId, 'chapter_id');

  if (subjectId || chapterId) {
    const resolved = await resolveHierarchyCourseScope(mysqlPool, { courseId, subjectId, chapterId });
    courseId = resolved.courseId;
  }

  if (courseId) {
    conditions.push('e.course_id = ?');
    params.push(courseId);
  }

  const userIdRaw = filters.user_id ?? filters.userId;
  if (userIdRaw !== undefined && userIdRaw !== null && String(userIdRaw).trim() !== '') {
    conditions.push('e.user_id = ?');
    params.push(normalizePositiveInt(userIdRaw, 'user_id'));
  }

  const gender = filters.gender !== undefined ? String(filters.gender).trim().toLowerCase() : 'all';
  if (gender && gender !== 'all') {
    if (gender !== 'male' && gender !== 'female') throw new ApiError(400, 'Invalid gender filter');
    conditions.push('e.gender = ?');
    params.push(gender);
  }

  const paymentRaw = filters.payment !== undefined ? String(filters.payment).trim().toLowerCase() : 'all';
  if (paymentRaw && paymentRaw !== 'all') {
    if (paymentRaw === 'paid') {
      conditions.push("o.id IS NOT NULL AND o.status = 'paid'");
    } else if (paymentRaw === 'unpaid') {
      conditions.push("o.id IS NOT NULL AND (o.status IS NULL OR o.status <> 'paid')");
    } else if (paymentRaw === 'no_order') {
      conditions.push('e.order_id IS NULL');
    } else {
      throw new ApiError(400, 'Invalid payment filter');
    }
  }

  const dateFrom = assertIsoDate(filters.dateFrom, 'dateFrom');
  const dateTo = assertIsoDate(filters.dateTo, 'dateTo');
  if (dateFrom) {
    conditions.push('DATE(e.created_at) >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push('DATE(e.created_at) <= ?');
    params.push(dateTo);
  }

  const q = String(filters.search || '')
    .trim()
    .slice(0, 160)
    .replace(/[%_\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (q) {
    const like = `%${q}%`;
    conditions.push(
      '(e.applicant_full_name LIKE ? OR e.email LIKE ? OR e.father_name LIKE ? OR CAST(e.whatsapp_number AS CHAR) LIKE ? OR c.title LIKE ? OR p.name LIKE ? OR b.name LIKE ?)'
    );
    params.push(like, like, like, like, like, like, like);
  }

  return fetchEnrollmentRows(conditions.join(' AND '), params);
}

export async function getEnrollmentById(id) {
  const enrollmentId = normalizePositiveInt(id, 'enrollment_id');
  return fetchEnrollmentRowById(enrollmentId);
}

export async function updateEnrollmentStatus({ enrollmentId, status, adminNote, reviewedBy }) {
  const normalizedStatus = normalizeStatus(status);
  const eid = normalizePositiveInt(enrollmentId, 'enrollment_id');
  const existing = await getEnrollmentById(eid);
  if (!existing) return null;

  if (normalizedStatus === 'approved') {
    if (!existing.orderId || existing.orderStatus !== 'paid') {
      throw new ApiError(409, 'Enrollment can only be approved after payment is confirmed');
    }
    await activateEnrollment({
      enrollmentId: eid,
      orderId: existing.orderId,
      actor: 'admin.approval',
      reason: adminNote || 'admin_approved',
      requirePaidOrder: true,
      enrollmentSource: ENROLLMENT_SOURCE.PAID,
    });
  } else if (normalizedStatus === 'rejected') {
    // If the enrollment currently grants active access, route through the lifecycle
    // service so access_status flips to 'revoked' atomically (matches entitlement
    // contract). For never-activated rows, plain UPDATE is sufficient.
    if (String(existing.accessStatus || '').toLowerCase() === 'active') {
      await revokeEnrollment({
        enrollmentId: eid,
        actor: 'admin.reject',
        adminNote: adminNote || 'admin_rejected',
      });
      await mysqlPool.query(
        `UPDATE enrollments
         SET admin_note = ?,
             reviewed_by = ?,
             reviewed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [adminNote || null, reviewedBy || null, eid]
      );
    } else {
      await mysqlPool.query(
        `UPDATE enrollments
         SET status = 'rejected',
             access_status = 'inactive',
             admin_note = ?,
             reviewed_by = ?,
             reviewed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [adminNote || null, reviewedBy || null, eid]
      );
    }
    return getEnrollmentById(eid);
  }

  await mysqlPool.query(
    `UPDATE enrollments
     SET status = ?,
         admin_note = ?,
         reviewed_by = ?,
         reviewed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [normalizedStatus, adminNote || null, reviewedBy || null, eid]
  );
  return getEnrollmentById(eid);
}

/**
 * Aggregated counts for the Registrations admin dashboard. Returns no PII — only
 * shape-safe integers — so it can be cached or rendered as quick stat tiles.
 *
 * @returns {Promise<{
 *   total: number,
 *   pending: number,
 *   approved: number,
 *   rejected: number,
 *   paidPendingReview: number,
 *   unpaid: number,
 *   noOrder: number,
 *   suspendedUsers: number,
 *   activeAccess: number,
 * }>}
 */
export async function summarizeEnrollments() {
  const [[totals]] = await mysqlPool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN e.status = 'pending'  THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN e.status = 'approved' THEN 1 ELSE 0 END) AS approved,
       SUM(CASE WHEN e.status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
       SUM(CASE WHEN e.access_status = 'active' THEN 1 ELSE 0 END) AS activeAccess
     FROM enrollments e`
  );

  const [[orderStats]] = await mysqlPool.query(
    `SELECT
       SUM(CASE WHEN e.order_id IS NULL THEN 1 ELSE 0 END) AS noOrder,
       SUM(CASE WHEN e.order_id IS NOT NULL AND o.status = 'paid' AND e.status = 'pending' THEN 1 ELSE 0 END) AS paidPendingReview,
       SUM(CASE WHEN e.order_id IS NOT NULL AND (o.status IS NULL OR o.status <> 'paid') THEN 1 ELSE 0 END) AS unpaid
     FROM enrollments e
     LEFT JOIN orders o ON o.id = e.order_id`
  );

  const [[suspendedRow]] = await mysqlPool.query(
    `SELECT COUNT(*) AS suspendedUsers
     FROM enrollments e
     INNER JOIN users u ON u.id = e.user_id
     WHERE u.status = 'suspended'`
  );

  const num = (v) => Number(v ?? 0) || 0;

  return {
    total: num(totals?.total),
    pending: num(totals?.pending),
    approved: num(totals?.approved),
    rejected: num(totals?.rejected),
    activeAccess: num(totals?.activeAccess),
    paidPendingReview: num(orderStats?.paidPendingReview),
    unpaid: num(orderStats?.unpaid),
    noOrder: num(orderStats?.noOrder),
    suspendedUsers: num(suspendedRow?.suspendedUsers),
  };
}

export { normalizeStatus as normalizeEnrollmentStatus };
