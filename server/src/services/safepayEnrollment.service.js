import { mysqlPool } from '../config/mysql.js';
import { ENROLLMENT_BATCH_IDS } from '../constants/enrollmentBatches.js';
import { ApiError } from '../utils/apiError.js';

function normalizePositiveInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ApiError(400, `${label} must be a valid positive integer`);
  }
  return n;
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
    divisionId: row.division_id,
    division: row.division_name || null,
    divisionSlug: row.division_slug || null,
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
    batchNumber: row.batch_number ?? null,
    status: row.status,
    accessStatus: row.access_status ?? 'inactive',
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
      e.division_id,
      d.name AS division_name,
      d.slug AS division_slug,
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
      e.batch_number,
      e.status,
      e.access_status,
      e.admin_note,
      e.reviewed_by,
      e.reviewed_at,
      e.created_at,
      e.updated_at
    FROM enrollments e
    INNER JOIN users u ON u.id = e.user_id
    INNER JOIN courses c ON c.id = e.course_id
    LEFT JOIN orders o ON o.id = e.order_id
    INNER JOIN provinces p ON p.id = e.province_id
    INNER JOIN divisions d ON d.id = e.division_id
    INNER JOIN districts ds ON ds.id = e.district_id
    INNER JOIN cities ct ON ct.id = e.city_id
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

export async function createEnrollment(payload) {
  const userId = normalizePositiveInt(payload.userId, 'user_id');
  const courseId = normalizePositiveInt(payload.courseId, 'course_id');
  const provinceId = normalizePositiveInt(payload.provinceId, 'province_id');
  const divisionId = normalizePositiveInt(payload.divisionId, 'division_id');
  const districtId = normalizePositiveInt(payload.districtId, 'district_id');
  const cityId = normalizePositiveInt(payload.cityId, 'city_id');
  const boardId = payload.boardId === undefined || payload.boardId === null || String(payload.boardId).trim() === ''
    ? null
    : normalizePositiveInt(payload.boardId, 'board_id');
  const orderId = payload.orderId === undefined || payload.orderId === null || String(payload.orderId).trim() === ''
    ? null
    : normalizePositiveInt(payload.orderId, 'order_id');

  const [result] = await mysqlPool.query(
    `INSERT INTO enrollments (
      user_id, course_id, order_id, applicant_full_name, father_name, date_of_birth, gender,
      whatsapp_number, email, province_id, division_id, district_id, city_id, board_id,
      hssc_status, mdcat_attempt_type, batch_number, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
      divisionId,
      districtId,
      cityId,
      boardId,
      payload.hsscStatus,
      payload.mdcatAttemptType,
      payload.batchNumber ?? null,
      'pending',
    ]
  );

  return fetchEnrollmentRowById(result.insertId);
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

  const batch = filters.batch !== undefined ? String(filters.batch).trim() : 'all';
  if (batch && batch !== 'all') {
    if (batch === 'unassigned') {
      conditions.push('(e.batch_number IS NULL OR e.batch_number = "")');
    } else if (ENROLLMENT_BATCH_IDS.includes(batch)) {
      conditions.push('e.batch_number = ?');
      params.push(batch);
    } else {
      throw new ApiError(400, 'Invalid batch filter');
    }
  }

  const status = filters.status !== undefined ? normalizeStatus(filters.status) : 'all';
  if (status && status !== 'all') {
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

  const divisionIdRaw = filters.division_id ?? filters.divisionId;
  if (divisionIdRaw !== undefined && divisionIdRaw !== null && String(divisionIdRaw).trim() !== '') {
    conditions.push('e.division_id = ?');
    params.push(normalizePositiveInt(divisionIdRaw, 'division_id'));
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

  const courseIdRaw = filters.course_id ?? filters.courseId;
  if (courseIdRaw !== undefined && courseIdRaw !== null && String(courseIdRaw).trim() !== '') {
    conditions.push('e.course_id = ?');
    params.push(normalizePositiveInt(courseIdRaw, 'course_id'));
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
  const existing = await getEnrollmentById(enrollmentId);
  if (!existing) return null;

  if (normalizedStatus === 'approved') {
    if (!existing.orderId || existing.orderStatus !== 'paid') {
      throw new ApiError(409, 'Enrollment can only be approved after payment is confirmed');
    }
  }

  await mysqlPool.query(
    `UPDATE enrollments
     SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [normalizedStatus, adminNote || null, reviewedBy || null, normalizePositiveInt(enrollmentId, 'enrollment_id')]
  );
  return getEnrollmentById(enrollmentId);
}

export { normalizeStatus as normalizeEnrollmentStatus };
