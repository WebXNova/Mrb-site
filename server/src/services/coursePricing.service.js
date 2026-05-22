import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import { toCoursePricingAdminDto, toCoursePricingPublicDto } from '../dto/coursePricing.dto.js';
import { formatMySqlDateTime } from '../utils/dateTime.js';

/**
 * Explicit projection for course_pricing reads. Never use SELECT * here — the
 * column list is the contract surface for the JOIN-based catalog queries.
 */
export const COURSE_PRICING_COLUMNS = `id, course_id, price_amount, original_price_amount, currency_code, pricing_type, is_active, enrollment_visible, public_purchase_visible, starts_at, ends_at, created_by, created_at, updated_at`;

/**
 * SQL predicate fragment that selects the "effective" pricing row for a course:
 *   active flag set AND inside any configured time window.
 * Use as: `WHERE course_id = ? AND ${EFFECTIVE_PRICING_PREDICATE}` and add
 * `ORDER BY id ASC LIMIT 1` for deterministic selection if data corruption
 * yields more than one match.
 */
export const EFFECTIVE_PRICING_PREDICATE = `is_active = 1
  AND (starts_at IS NULL OR starts_at <= UTC_TIMESTAMP())
  AND (ends_at IS NULL OR ends_at > UTC_TIMESTAMP())`;

function courseNotFound() {
  return new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
}

async function assertCourseExists(courseId) {
  const row = await getCourseRowById(courseId);
  if (!row) throw courseNotFound();
}

function validatePricingDomain(input) {
  if (input.pricing_type === 'free' && input.price_amount !== 0) {
    throw new ApiError(422, 'price_amount must be 0 when pricing_type is "free"', { code: 'INVALID_PRICING' });
  }
  if (
    input.original_price_amount != null &&
    Number.isFinite(Number(input.original_price_amount)) &&
    Number(input.original_price_amount) <= Number(input.price_amount)
  ) {
    throw new ApiError(422, 'original_price_amount must be greater than price_amount when set', {
      code: 'INVALID_PRICING',
    });
  }
  if (input.starts_at && input.ends_at) {
    const start = Date.parse(input.starts_at);
    const end = Date.parse(input.ends_at);
    if (Number.isFinite(start) && Number.isFinite(end) && start >= end) {
      throw new ApiError(422, 'ends_at must be after starts_at', { code: 'INVALID_PRICING_WINDOW' });
    }
  }
}

function normalizeWriteInput(payload) {
  const priceAmount = Math.trunc(Number(payload.price_amount ?? 0));
  const originalRaw = payload.original_price_amount;
  const originalPriceAmount =
    originalRaw === null || originalRaw === undefined || originalRaw === '' ? null : Math.trunc(Number(originalRaw));
  const currencyCode = String(payload.currency_code ?? 'PKR').toUpperCase().trim() || 'PKR';
  const pricingType = String(payload.pricing_type ?? 'one_time').toLowerCase().trim();
  const isActive = payload.is_active === undefined ? true : Boolean(payload.is_active);
  const startsAt = payload.starts_at
    ? formatMySqlDateTime(payload.starts_at, { fieldName: 'starts_at' })
    : null;
  const endsAt = payload.ends_at
    ? formatMySqlDateTime(payload.ends_at, { fieldName: 'ends_at' })
    : null;
  const enrollmentVisible =
    payload.enrollment_visible === undefined ? true : Boolean(payload.enrollment_visible);
  const publicPurchaseVisible =
    payload.public_purchase_visible === undefined ? true : Boolean(payload.public_purchase_visible);
  return {
    price_amount: priceAmount,
    original_price_amount: originalPriceAmount,
    currency_code: currencyCode,
    pricing_type: pricingType,
    is_active: isActive,
    enrollment_visible: enrollmentVisible,
    public_purchase_visible: publicPurchaseVisible,
    starts_at: startsAt,
    ends_at: endsAt,
  };
}

/**
 * Replace the active pricing row for a course.
 *
 * Domain rule: at most one row per `course_id` may have `is_active = 1`. This
 * helper deactivates any existing active rows in the same transaction, then
 * inserts the new row (active or scheduled). Returns the persisted row.
 *
 * @param {number} courseId
 * @param {object} payload validated body
 * @param {number|null} actorUserId
 */
export async function upsertActiveCoursePricing(courseId, payload, actorUserId = null) {
  await assertCourseExists(courseId);
  const input = normalizeWriteInput(payload);
  validatePricingDomain(input);

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    if (input.is_active) {
      await connection.query(
        `UPDATE course_pricing SET is_active = 0 WHERE course_id = ? AND is_active = 1`,
        [courseId]
      );
    }

    const [result] = await connection.query(
      `INSERT INTO course_pricing
       (course_id, price_amount, original_price_amount, currency_code, pricing_type, is_active, enrollment_visible, public_purchase_visible, starts_at, ends_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        courseId,
        input.price_amount,
        input.original_price_amount,
        input.currency_code,
        input.pricing_type,
        input.is_active ? 1 : 0,
        input.enrollment_visible ? 1 : 0,
        input.public_purchase_visible ? 1 : 0,
        input.starts_at,
        input.ends_at,
        actorUserId,
      ]
    );

    const [rows] = await connection.query(
      `SELECT ${COURSE_PRICING_COLUMNS} FROM course_pricing WHERE id = ? LIMIT 1`,
      [result.insertId]
    );
    await connection.commit();
    return toCoursePricingAdminDto(rows[0]);
  } catch (e) {
    try { await connection.rollback(); } catch { /* already rolled back */ }
    throw e;
  } finally {
    connection.release();
  }
}

/**
 * Insert a default `free` active pricing row for a freshly created course.
 * Used by `createCourse` so newly created catalog rows always have `pricing`.
 * Accepts an open connection so the caller controls transactional scope.
 */
export async function createDefaultFreeCoursePricing(connection, courseId, actorUserId = null) {
  await connection.query(
    `INSERT INTO course_pricing
     (course_id, price_amount, original_price_amount, currency_code, pricing_type, is_active, enrollment_visible, public_purchase_visible, starts_at, ends_at, created_by)
     VALUES (?, 0, NULL, 'PKR', 'free', 1, 1, 1, NULL, NULL, ?)`,
    [courseId, actorUserId]
  );
}

/**
 * Insert an admin-supplied pricing row for a freshly created course inside
 * the caller's open transaction. Runs the same domain validation as the
 * regular admin update path so create-with-pricing and PUT pricing share
 * identical rules.
 *
 * @param {import('mysql2/promise').PoolConnection} connection open transaction
 * @param {number} courseId
 * @param {object} payload validated body (from `coursePricingWriteBodySchema`)
 * @param {number|null} actorUserId
 */
export async function insertActiveCoursePricingWithConnection(
  connection,
  courseId,
  payload,
  actorUserId = null
) {
  const input = normalizeWriteInput(payload);
  validatePricingDomain(input);
  await connection.query(
    `INSERT INTO course_pricing
     (course_id, price_amount, original_price_amount, currency_code, pricing_type, is_active, enrollment_visible, public_purchase_visible, starts_at, ends_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      courseId,
      input.price_amount,
      input.original_price_amount,
      input.currency_code,
      input.pricing_type,
      input.is_active ? 1 : 0,
      input.enrollment_visible ? 1 : 0,
      input.public_purchase_visible ? 1 : 0,
      input.starts_at,
      input.ends_at,
      actorUserId,
    ]
  );
}

/** Deactivate every active pricing row for a course. */
export async function deactivateActiveCoursePricing(courseId) {
  await assertCourseExists(courseId);
  await mysqlPool.query(
    `UPDATE course_pricing SET is_active = 0 WHERE course_id = ? AND is_active = 1`,
    [courseId]
  );
}

/**
 * Read the effective pricing for one course (public-shaped DTO or null).
 */
export async function getEffectivePricingForCourse(courseId) {
  const [rows] = await mysqlPool.query(
    `SELECT ${COURSE_PRICING_COLUMNS}
     FROM course_pricing
     WHERE course_id = ?
       AND ${EFFECTIVE_PRICING_PREDICATE}
     ORDER BY id ASC
     LIMIT 1`,
    [courseId]
  );
  return toCoursePricingPublicDto(rows[0] || null);
}

/**
 * Batch read: returns a Map<courseId, publicPricingDto|null>.
 * Used by list endpoints to avoid N+1 queries. Caller can `.get(id) ?? null`.
 */
export async function getEffectivePricingByCourseIds(courseIds) {
  const ids = (Array.isArray(courseIds) ? courseIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await mysqlPool.query(
    `SELECT ${COURSE_PRICING_COLUMNS}
     FROM course_pricing
     WHERE course_id IN (${placeholders})
       AND ${EFFECTIVE_PRICING_PREDICATE}
     ORDER BY course_id ASC, id ASC`,
    ids
  );
  const result = new Map();
  for (const row of rows) {
    const courseId = Number(row.course_id);
    if (!result.has(courseId)) {
      result.set(courseId, toCoursePricingPublicDto(row));
    }
  }
  return result;
}

/**
 * Read the row most useful to render in the admin editor: prefer the active
 * (or scheduled-active) row, fall back to the most recently updated row, else null.
 */
export async function getAdminPricingForCourse(courseId) {
  await assertCourseExists(courseId);
  const [activeRows] = await mysqlPool.query(
    `SELECT ${COURSE_PRICING_COLUMNS}
     FROM course_pricing
     WHERE course_id = ? AND is_active = 1
     ORDER BY id ASC
     LIMIT 1`,
    [courseId]
  );
  if (activeRows[0]) return toCoursePricingAdminDto(activeRows[0]);
  const [recentRows] = await mysqlPool.query(
    `SELECT ${COURSE_PRICING_COLUMNS}
     FROM course_pricing
     WHERE course_id = ?
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [courseId]
  );
  return toCoursePricingAdminDto(recentRows[0] || null);
}
