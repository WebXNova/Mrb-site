import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import { COURSE_BATCH_PUBLIC_STATUSES, COURSE_BATCH_STATUSES } from '../constants/courseBatchStatus.js';
import { toCourseBatchAdminDto, toCourseBatchPublicDto } from '../dto/courseBatch.dto.js';
import { validateBatchScheduleWindow } from '../utils/batchDateTime.js';
import { formatMySqlDateTime } from '../utils/dateTime.js';
import { customAlphabet } from 'nanoid';

const genBatchCode = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 12);

export const COURSE_BATCH_ROW_SELECT = `
  SELECT
    b.id,
    b.course_id,
    b.title,
    b.code,
    b.start_date,
    b.end_date,
    b.total_seats,
    b.seats_filled,
    b.instructor_name,
    b.schedule_label,
    b.timezone,
    b.status,
    b.is_active,
    b.show_publicly,
    b.recordings_enabled,
    b.created_by,
    b.created_at,
    b.updated_at
  FROM course_batches b
`;

function batchNotFound() {
  return new ApiError(404, 'Batch not found', { code: 'BATCH_NOT_FOUND' });
}

function courseNotFound() {
  return new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
}

function invalidBatchId() {
  return new ApiError(400, 'Invalid batch id', { code: 'INVALID_BATCH_ID' });
}

function isDupEntry(err) {
  return err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062);
}

/**
 * Normalize batch lifecycle status when a course is being published.
 * Maps draft/operational UI picks to catalog-safe statuses reachable from insert (`draft` → X).
 *
 * @param {string} rawStatus
 */
export function normalizeBatchStatusForPublish(rawStatus) {
  const status = String(rawStatus || 'draft').toLowerCase();
  if (status === 'draft') return 'upcoming';
  if (['published', 'upcoming', 'enrollment_open'].includes(status)) return status;
  return 'upcoming';
}

/**
 * @param {string} from
 * @param {string} to
 * @param {{ isSuperAdmin?: boolean }} [ctx] True when LMS session satisfies `isAdminRole()` (`admin` or `super_admin`); wired from authenticated admin routes only.
 */
export function validateBatchStateTransition(from, to, ctx = {}) {
  const f = String(from || '').toLowerCase();
  const t = String(to || '').toLowerCase();
  if (f === t) return;
  if (!COURSE_BATCH_STATUSES.includes(t)) {
    throw new ApiError(422, 'Invalid batch status', { code: 'INVALID_BATCH_STATUS' });
  }
  if (f === 'cancelled' && t === 'running') {
    throw new ApiError(409, 'Cancelled batches cannot become running', { code: 'INVALID_BATCH_STATE_TRANSITION' });
  }
  const graph = {
    draft: ['published', 'upcoming', 'enrollment_open', 'cancelled', 'archived'],
    published: ['upcoming', 'enrollment_open', 'cancelled', 'archived'],
    upcoming: ['published', 'enrollment_open', 'cancelled', 'archived'],
    enrollment_open: ['running', 'cancelled', 'archived'],
    running: ['completed', 'cancelled', 'archived'],
    completed: ['archived'],
    cancelled: ['archived'],
    archived: [],
  };
  const allowed = graph[f] || [];
  if (allowed.includes(t)) return;
  const { isSuperAdmin = false } = ctx;
  if (isSuperAdmin && f === 'cancelled' && (t === 'draft' || t === 'upcoming')) return;
  throw new ApiError(409, 'Disallowed batch status transition', {
    code: 'INVALID_BATCH_STATE_TRANSITION',
    details: { from: f, to: t },
  });
}

/**
 * @param {{ start_date: string, end_date: string }} row
 */
export function validateEnrollmentWindow(row) {
  const result = validateBatchScheduleWindow(row);
  if (!result.ok) {
    throw new ApiError(422, result.message, { code: 'INVALID_BATCH_SCHEDULE' });
  }
}

/**
 * Legacy NOT NULL columns on course_batches — default to batch schedule when omitted.
 * @param {object} payload
 * @param {string} startDate formatted MySQL datetime
 * @param {string} endDate formatted MySQL datetime
 */
function resolveBatchEnrollmentDatetimes(payload, startDate, endDate) {
  if (payload.enrollment_open_at) {
    return {
      enrollment_open_at: formatMySqlDateTime(payload.enrollment_open_at, {
        fieldName: 'enrollment_open_at',
      }),
      enrollment_close_at: formatMySqlDateTime(
        payload.enrollment_close_at || payload.end_date || endDate,
        { fieldName: 'enrollment_close_at' }
      ),
    };
  }
  return {
    enrollment_open_at: startDate,
    enrollment_close_at: endDate,
  };
}

/**
 * @param {{ total_seats: number, seats_filled: number, status?: string }} row
 * @param {{ nextTotalSeats?: number }} [patch]
 */
export function validateSeatRules(row, patch = {}) {
  const total = Number(row.total_seats ?? 0);
  const filled = Number(row.seats_filled ?? 0);
  const nextTotal = patch.nextTotalSeats != null ? Number(patch.nextTotalSeats) : total;
  if (!Number.isFinite(nextTotal) || nextTotal < 1) {
    throw new ApiError(422, 'total_seats must be at least 1', { code: 'INVALID_BATCH_SEAT_CONFIGURATION' });
  }
  if (!Number.isFinite(filled) || filled < 0) {
    throw new ApiError(422, 'Invalid seat counters', { code: 'INVALID_BATCH_SEAT_CONFIGURATION' });
  }
  if (filled > total) {
    throw new ApiError(409, 'seats_filled exceeds total_seats', { code: 'INVALID_BATCH_SEAT_CONFIGURATION' });
  }
  if (filled > nextTotal) {
    throw new ApiError(409, 'Cannot reduce total_seats below seats_filled', {
      code: 'INVALID_BATCH_SEAT_CONFIGURATION',
    });
  }
  const st = String(row.status || '').toLowerCase();
  if (st === 'running' && nextTotal < filled) {
    throw new ApiError(409, 'Running batches cannot reduce total_seats below seats_filled', {
      code: 'INVALID_BATCH_SEAT_CONFIGURATION',
    });
  }
}

async function getBatchRowById(batchId) {
  const [rows] = await mysqlPool.query(`${COURSE_BATCH_ROW_SELECT} WHERE b.id = ? LIMIT 1`, [batchId]);
  return rows[0] || null;
}

export async function getBatchById(batchId) {
  const id = Number(batchId);
  if (!Number.isFinite(id) || id <= 0) throw invalidBatchId();
  const row = await getBatchRowById(id);
  if (!row) throw batchNotFound();
  return toCourseBatchAdminDto(row);
}

export async function listCourseBatches(courseId) {
  const cid = Number(courseId);
  if (!Number.isFinite(cid) || cid <= 0) {
    throw new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
  }
  const course = await getCourseRowById(cid, { activeOnly: false });
  if (!course) throw courseNotFound();
  const [rows] = await mysqlPool.query(
    `${COURSE_BATCH_ROW_SELECT} WHERE b.course_id = ? ORDER BY b.start_date ASC, b.id ASC`,
    [cid]
  );
  const now = new Date();
  return rows.map((r) => toCourseBatchAdminDto(r, { now }));
}

export async function listPublicCourseBatches(courseId) {
  const cid = Number(courseId);
  if (!Number.isFinite(cid) || cid <= 0) {
    throw new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
  }
  const course = await getCourseRowById(cid, { activeOnly: true });
  if (!course) throw courseNotFound();
  const placeholders = COURSE_BATCH_PUBLIC_STATUSES.map(() => '?').join(', ');
  const [rows] = await mysqlPool.query(
    `${COURSE_BATCH_ROW_SELECT}
     WHERE b.course_id = ?
       AND b.is_active = TRUE
       AND b.show_publicly = TRUE
       AND b.status IN (${placeholders})
     ORDER BY b.start_date ASC, b.id ASC`,
    [cid, ...COURSE_BATCH_PUBLIC_STATUSES]
  );
  const now = new Date();
  return rows.map((r) => toCourseBatchPublicDto(r, { now }));
}

export async function createBatch(courseId, payload, createdByUserId) {
  const cid = Number(courseId);
  if (!Number.isFinite(cid) || cid <= 0) {
    throw new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
  }
  const course = await getCourseRowById(cid, { activeOnly: false });
  if (!course) throw courseNotFound();
  // Enforce single-batch-per-course invariant
  const [existingRows] = await mysqlPool.query(
    'SELECT id FROM course_batches WHERE course_id = ? LIMIT 1',
    [cid]
  );
  if (existingRows.length > 0) {
    throw new ApiError(409, 'Course already has a batch', {
      code: 'COURSE_BATCH_LIMIT_REACHED',
    });
  }
  const courseActive = Boolean(Number(course.is_active));
  if (!courseActive) {
    if (payload.is_active) {
      throw new ApiError(409, 'Inactive courses cannot create active batches', { code: 'COURSE_INACTIVE' });
    }
  }
  const rowLike = {
    start_date: payload.start_date,
    end_date: payload.end_date,
  };
  validateEnrollmentWindow(rowLike);
  const rawInitial = String(payload.status || 'draft').toLowerCase();
  const allowedFromDraft = new Set([
    'draft',
    'published',
    'upcoming',
    'enrollment_open',
    'cancelled',
    'archived',
  ]);
  const initial = allowedFromDraft.has(rawInitial) ? rawInitial : 'upcoming';
  validateSeatRules({ total_seats: payload.total_seats, seats_filled: 0, status: initial });
  validateBatchStateTransition('draft', initial, { isSuperAdmin: false });

  const insInstructor = payload.instructor_name == null ? null : String(payload.instructor_name).trim() || null;
  const insSchedule = payload.schedule_label == null ? null : String(payload.schedule_label).trim() || null;

  // CRITICAL: Backend always generates secure batch codes
  const code = `B${genBatchCode()}`;

  // Normalize datetimes for MySQL
  const startDate = formatMySqlDateTime(payload.start_date, { fieldName: 'start_date' });
  const endDate = formatMySqlDateTime(payload.end_date, { fieldName: 'end_date' });
  const enrollmentWindow = resolveBatchEnrollmentDatetimes(payload, startDate, endDate);

  try {
    const [result] = await mysqlPool.query(
      `INSERT INTO course_batches (
        course_id, title, code, start_date, end_date,
        enrollment_open_at, enrollment_close_at,
        total_seats, seats_filled,
        instructor_name, schedule_label, timezone, status, is_active,
        show_publicly, recordings_enabled,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cid,
        payload.title,
        code,
        startDate,
        endDate,
        enrollmentWindow.enrollment_open_at,
        enrollmentWindow.enrollment_close_at,
        payload.total_seats,
        insInstructor,
        insSchedule,
        payload.timezone || 'UTC',
        initial,
        Boolean(payload.is_active),
        payload.show_publicly !== false ? 1 : 0,
        payload.recordings_enabled !== false ? 1 : 0,
        createdByUserId ?? null,
      ]
    );
    const insertId = result.insertId;
    const created = await getBatchRowById(insertId);
    return toCourseBatchAdminDto(created);
  } catch (e) {
    if (isDupEntry(e)) {
      throw new ApiError(409, 'Batch code already exists', { code: 'BATCH_CODE_CONFLICT' });
    }
    throw e;
  }
}

function mysqlDateTimeToInput(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    return new Date(`${s.replace(' ', 'T')}Z`).toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T00:00:00.000Z`).toISOString();
  }
  return s;
}

export async function updateBatch(batchId, patch, { isSuperAdmin = false } = {}) {
  const id = Number(batchId);
  if (!Number.isFinite(id) || id <= 0) throw invalidBatchId();
  const row = await getBatchRowById(id);
  if (!row) throw batchNotFound();
  const course = await getCourseRowById(Number(row.course_id), { activeOnly: false });
  if (!course) throw courseNotFound();

  const curStatus = String(row.status || '').toLowerCase();
  if (curStatus === 'archived') {
    throw new ApiError(409, 'Archived batches are immutable', { code: 'BATCH_ARCHIVED' });
  }

  const nextStatus = patch.status != null ? String(patch.status).toLowerCase() : curStatus;
  if (patch.status != null && nextStatus !== curStatus) {
    validateBatchStateTransition(curStatus, nextStatus, { isSuperAdmin });
  }

  const mergedDates = {
    start_date: patch.start_date ?? mysqlDateTimeToInput(row.start_date),
    end_date: patch.end_date ?? mysqlDateTimeToInput(row.end_date),
    enrollment_open_at: patch.enrollment_open_at ?? mysqlDateTimeToInput(row.enrollment_open_at),
    enrollment_close_at: patch.enrollment_close_at ?? mysqlDateTimeToInput(row.enrollment_close_at),
  };
  validateEnrollmentWindow(mergedDates);

  const nextTotal = patch.total_seats != null ? Number(patch.total_seats) : Number(row.total_seats);
  validateSeatRules(
    { total_seats: row.total_seats, seats_filled: row.seats_filled, status: curStatus },
    { nextTotalSeats: nextTotal }
  );

  const courseActive = Boolean(Number(course.is_active));
  const nextIsActive = patch.is_active != null ? Boolean(patch.is_active) : Boolean(Number(row.is_active));
  if (!courseActive && nextIsActive) {
    throw new ApiError(409, 'Cannot activate batches for an inactive course', { code: 'COURSE_INACTIVE' });
  }

  const nextTitle = patch.title != null ? patch.title : String(row.title ?? '');
  const nextCode = patch.code != null ? patch.code : String(row.code ?? '');
  const nextTz = patch.timezone != null ? patch.timezone : String(row.timezone ?? 'UTC');
  const insInstructor =
    patch.instructor_name !== undefined
      ? patch.instructor_name == null
        ? null
        : String(patch.instructor_name).trim() || null
      : row.instructor_name == null
        ? null
        : String(row.instructor_name);
  const insSchedule =
    patch.schedule_label !== undefined
      ? patch.schedule_label == null
        ? null
        : String(patch.schedule_label).trim() || null
      : row.schedule_label == null
        ? null
        : String(row.schedule_label);

  const nextShowPub =
    patch.show_publicly !== undefined ? Boolean(patch.show_publicly) : Boolean(Number(row.show_publicly ?? 1));
  const nextRec =
    patch.recordings_enabled !== undefined
      ? Boolean(patch.recordings_enabled)
      : Boolean(Number(row.recordings_enabled ?? 1));

  // Normalize datetimes for MySQL
  const startDate = formatMySqlDateTime(mergedDates.start_date, { fieldName: 'start_date' });
  const endDate = formatMySqlDateTime(mergedDates.end_date, { fieldName: 'end_date' });

  try {
    await mysqlPool.query(
      `UPDATE course_batches SET
        title = ?, code = ?, start_date = ?, end_date = ?,
        total_seats = ?,
        instructor_name = ?, schedule_label = ?, timezone = ?, status = ?, is_active = ?,
        show_publicly = ?, recordings_enabled = ?
      WHERE id = ?`,
      [
        nextTitle,
        nextCode,
        startDate,
        endDate,
        nextTotal,
        insInstructor,
        insSchedule,
        nextTz,
        nextStatus,
        nextIsActive,
        nextShowPub ? 1 : 0,
        nextRec ? 1 : 0,
        id,
      ]
    );
  } catch (e) {
    if (isDupEntry(e)) {
      throw new ApiError(409, 'Batch code already exists', { code: 'BATCH_CODE_CONFLICT' });
    }
    throw e;
  }

  const updated = await getBatchRowById(id);
  return toCourseBatchAdminDto(updated);
}

export async function archiveBatch(batchId) {
  const id = Number(batchId);
  if (!Number.isFinite(id) || id <= 0) throw invalidBatchId();
  const row = await getBatchRowById(id);
  if (!row) throw batchNotFound();
  const cur = String(row.status || '').toLowerCase();
  if (cur === 'archived') {
    return toCourseBatchAdminDto(row);
  }
  validateBatchStateTransition(cur, 'archived', { isSuperAdmin: false });
  await mysqlPool.query(`UPDATE course_batches SET status = 'archived', is_active = FALSE WHERE id = ?`, [id]);
  const updated = await getBatchRowById(id);
  return toCourseBatchAdminDto(updated);
}

export async function reactivateBatch(batchId, { isSuperAdmin = false } = {}) {
  const id = Number(batchId);
  if (!Number.isFinite(id) || id <= 0) throw invalidBatchId();
  const row = await getBatchRowById(id);
  if (!row) throw batchNotFound();
  const cur = String(row.status || '').toLowerCase();
  if (cur === 'archived') {
    if (!isSuperAdmin) {
      throw new ApiError(403, 'Only a super admin may recover archived batches', {
        code: 'FORBIDDEN_BATCH_OPERATION',
      });
    }
    await mysqlPool.query(`UPDATE course_batches SET status = 'draft', is_active = TRUE WHERE id = ?`, [id]);
    const updated = await getBatchRowById(id);
    return toCourseBatchAdminDto(updated);
  }
  if (!Boolean(Number(row.is_active))) {
    await mysqlPool.query(`UPDATE course_batches SET is_active = TRUE WHERE id = ?`, [id]);
    const updated = await getBatchRowById(id);
    return toCourseBatchAdminDto(updated);
  }
  return toCourseBatchAdminDto(row);
}

/**
 * Insert a batch row inside an open transaction (wizard orchestration).
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} courseId
 * @param {object} payload validated batch fields incl. optional `code`
 * @param {number|null} createdByUserId
 * @returns {Promise<number>} insert id
 */
export async function insertCourseBatchWithConnection(connection, courseId, payload, createdByUserId) {
  const cid = Number(courseId);
  if (!Number.isFinite(cid) || cid <= 0) {
    throw new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
  }
  const [crows] = await connection.query(`SELECT id, is_active FROM courses WHERE id = ? LIMIT 1`, [cid]);
  const course = crows[0];
  if (!course) throw courseNotFound();

  // Enforce single-batch-per-course invariant even inside transactions
  const [existingRows] = await connection.query(
    'SELECT id FROM course_batches WHERE course_id = ? LIMIT 1',
    [cid]
  );
  if (existingRows.length > 0) {
    throw new ApiError(409, 'Course already has a batch', {
      code: 'COURSE_BATCH_LIMIT_REACHED',
    });
  }

  const courseActive = Boolean(Number(course.is_active));
  if (!courseActive && payload.is_active) {
    throw new ApiError(409, 'Inactive courses cannot create active batches', { code: 'COURSE_INACTIVE' });
  }

  const rowLike = {
    start_date: payload.start_date,
    end_date: payload.end_date,
  };
  validateEnrollmentWindow(rowLike);

  const rawInitial = String(payload.status || 'draft').toLowerCase();
  const allowedFromDraft = new Set([
    'draft',
    'published',
    'upcoming',
    'enrollment_open',
    'cancelled',
    'archived',
  ]);
  const initial = allowedFromDraft.has(rawInitial) ? rawInitial : 'upcoming';
  validateSeatRules({ total_seats: payload.total_seats, seats_filled: 0, status: initial });
  validateBatchStateTransition('draft', initial, { isSuperAdmin: false });

  // CRITICAL: Backend always generates secure batch codes
  // Frontend must NEVER send batch codes - they are internal identifiers
  const code = `B${genBatchCode()}`;

  const insInstructor = payload.instructor_name == null ? null : String(payload.instructor_name).trim() || null;
  const insSchedule = payload.schedule_label == null ? null : String(payload.schedule_label).trim() || null;

  // Normalize datetimes for MySQL
  const startDate = formatMySqlDateTime(payload.start_date, { fieldName: 'start_date' });
  const endDate = formatMySqlDateTime(payload.end_date, { fieldName: 'end_date' });
  const enrollmentWindow = resolveBatchEnrollmentDatetimes(payload, startDate, endDate);

  try {
    const [result] = await connection.query(
      `INSERT INTO course_batches (
        course_id, title, code, start_date, end_date,
        enrollment_open_at, enrollment_close_at,
        total_seats, seats_filled,
        instructor_name, schedule_label, timezone, status, is_active,
        show_publicly, recordings_enabled,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cid,
        payload.title,
        code,
        startDate,
        endDate,
        enrollmentWindow.enrollment_open_at,
        enrollmentWindow.enrollment_close_at,
        payload.total_seats,
        insInstructor,
        insSchedule,
        payload.timezone || 'UTC',
        initial,
        Boolean(payload.is_active),
        payload.show_publicly !== false ? 1 : 0,
        payload.recordings_enabled !== false ? 1 : 0,
        createdByUserId ?? null,
      ]
    );
    return result.insertId;
  } catch (e) {
    if (isDupEntry(e)) {
      throw new ApiError(409, 'Batch code already exists', { code: 'BATCH_CODE_CONFLICT' });
    }
    throw e;
  }
}
