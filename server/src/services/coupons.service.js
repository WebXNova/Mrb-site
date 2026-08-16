/**
 * Course coupons — admin CRUD with transactional updates and activity logging.
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import { logActivity } from './activityLog.service.js';
import {
  assertDiscountValueForType,
  parseCreateCouponBody,
  parseUpdateCouponBody,
} from '../validators/coupon.schema.js';

function mapCouponRow(row) {
  return {
    id: Number(row.id),
    code: row.code,
    courseId: Number(row.course_id),
    courseTitle: row.course_title || null,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    usageLimit: Number(row.usage_limit),
    usedCount: Number(row.used_count),
    validFrom: row.valid_from,
    validUntil: row.valid_until ?? null,
    isActive: Boolean(row.is_active),
    createdBy: Number(row.created_by),
    updatedBy: row.updated_by == null ? null : Number(row.updated_by),
    createdByName: row.created_by_name || null,
    updatedByName: row.updated_by_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function snapshotCoupon(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    code: String(row.code),
    course_id: Number(row.course_id),
    discount_type: row.discount_type,
    discount_value: Number(row.discount_value),
    usage_limit: Number(row.usage_limit),
    used_count: Number(row.used_count),
    valid_from: row.valid_from,
    valid_until: row.valid_until ?? null,
    is_active: Boolean(row.is_active),
  };
}

const LIST_SQL = `
  SELECT
    cp.id,
    cp.code,
    cp.course_id,
    cp.discount_type,
    cp.discount_value,
    cp.usage_limit,
    cp.used_count,
    cp.valid_from,
    cp.valid_until,
    cp.is_active,
    cp.created_by,
    cp.updated_by,
    cp.created_at,
    cp.updated_at,
    c.title AS course_title,
    cb.full_name AS created_by_name,
    ub.full_name AS updated_by_name
  FROM coupons cp
  INNER JOIN courses c ON c.id = cp.course_id
  INNER JOIN users cb ON cb.id = cp.created_by
  LEFT JOIN users ub ON ub.id = cp.updated_by
`;

async function logCouponActivity({ actorId, actorRole, action, couponId, metadata }) {
  void logActivity({
    userId: actorId,
    role: typeof actorRole === 'string' ? actorRole : 'admin',
    action,
    entityType: 'coupon',
    entityId: String(couponId),
    metadata,
  });
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {string} code
 * @param {number|null} excludeId
 */
async function assertUniqueCouponCode(connection, code, excludeId = null) {
  const params = [code];
  let sql = `SELECT id FROM coupons WHERE code = ?`;
  if (excludeId != null) {
    sql += ` AND id <> ?`;
    params.push(Number(excludeId));
  }
  sql += ` LIMIT 1 FOR UPDATE`;
  const [rows] = await connection.query(sql, params);
  if (rows[0]) {
    throw new ApiError(409, 'A coupon with this code already exists', {
      code: 'COUPON_CODE_TAKEN',
      field: 'code',
    });
  }
}

/**
 * @param {number} courseId
 */
async function resolveCoursePriceAmount(courseId) {
  const row = await getCourseRowById(courseId);
  if (!row) {
    throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND', field: 'course_id' });
  }
  const price = row.cp_price_amount;
  return price == null ? null : Number(price);
}

export async function listCoupons() {
  const [rows] = await mysqlPool.query(`${LIST_SQL} ORDER BY cp.created_at DESC, cp.id DESC`);
  return rows.map(mapCouponRow);
}

/**
 * @param {number} couponId
 */
export async function getCouponById(couponId) {
  const id = Number(couponId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid coupon id');
  }
  const [rows] = await mysqlPool.query(`${LIST_SQL} WHERE cp.id = ? LIMIT 1`, [id]);
  return rows[0] ? mapCouponRow(rows[0]) : null;
}

/**
 * @param {{ body: object, actorId: number, actorRole?: string }}
 */
export async function createCoupon({ body, actorId, actorRole }) {
  const dto = parseCreateCouponBody(body);
  const coursePriceAmount = await resolveCoursePriceAmount(dto.course_id);
  assertDiscountValueForType(dto.discount_type, dto.discount_value, coursePriceAmount);

  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();
    await assertUniqueCouponCode(connection, dto.code);

    const [insertResult] = await connection.query(
      `INSERT INTO coupons
        (code, course_id, discount_type, discount_value, usage_limit, used_count, valid_from, valid_until, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, TRUE, ?, ?)`,
      [
        dto.code,
        dto.course_id,
        dto.discount_type,
        dto.discount_value,
        dto.usage_limit,
        dto.valid_from,
        dto.valid_until,
        actorId,
        actorId,
      ]
    );

    const couponId = Number(insertResult.insertId);
    const newSnapshot = {
      id: couponId,
      code: dto.code,
      course_id: dto.course_id,
      discount_type: dto.discount_type,
      discount_value: dto.discount_value,
      usage_limit: dto.usage_limit,
      used_count: 0,
      valid_from: dto.valid_from,
      valid_until: dto.valid_until,
      is_active: true,
    };

    await connection.commit();

    void logCouponActivity({
      actorId,
      actorRole,
      action: 'coupon.created',
      couponId,
      metadata: { newValue: newSnapshot },
    });

    const created = await getCouponById(couponId);
    if (!created) {
      throw new ApiError(500, 'Coupon missing after create');
    }
    return created;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* ignore */
    }
    if (error?.code === 'ER_DUP_ENTRY') {
      throw new ApiError(409, 'A coupon with this code already exists', {
        code: 'COUPON_CODE_TAKEN',
        field: 'code',
      });
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * @param {{ couponId: number, body: object, actorId: number, actorRole?: string }}
 */
export async function updateCoupon({ couponId, body, actorId, actorRole }) {
  const id = Number(couponId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid coupon id');
  }

  const dto = parseUpdateCouponBody(body);
  const coursePriceAmount = await resolveCoursePriceAmount(dto.course_id);
  assertDiscountValueForType(dto.discount_type, dto.discount_value, coursePriceAmount);

  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, code, course_id, discount_type, discount_value, usage_limit, used_count, valid_from, valid_until, is_active
       FROM coupons
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );
    const existing = rows[0];
    if (!existing) {
      throw new ApiError(404, 'Coupon not found');
    }

    const usedCount = Number(existing.used_count);
    if (usedCount > 0 && dto.code !== String(existing.code)) {
      throw new ApiError(422, 'Coupon code cannot be changed after it has been redeemed', {
        code: 'COUPON_CODE_LOCKED',
        field: 'code',
      });
    }
    if (usedCount > 0 && dto.course_id !== Number(existing.course_id)) {
      throw new ApiError(422, 'Course cannot be changed after the coupon has been redeemed', {
        code: 'COUPON_COURSE_LOCKED',
        field: 'course_id',
      });
    }
    if (dto.usage_limit < usedCount) {
      throw new ApiError(422, 'usage_limit cannot be less than the number of times already redeemed', {
        code: 'USAGE_LIMIT_TOO_LOW',
        field: 'usage_limit',
        usedCount,
      });
    }

    await assertUniqueCouponCode(connection, dto.code, id);
    const oldSnapshot = snapshotCoupon(existing);

    await connection.query(
      `UPDATE coupons
       SET code = ?, course_id = ?, discount_type = ?, discount_value = ?, usage_limit = ?,
           valid_from = ?, valid_until = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        dto.code,
        dto.course_id,
        dto.discount_type,
        dto.discount_value,
        dto.usage_limit,
        dto.valid_from,
        dto.valid_until,
        actorId,
        id,
      ]
    );

    const newSnapshot = {
      ...oldSnapshot,
      code: dto.code,
      course_id: dto.course_id,
      discount_type: dto.discount_type,
      discount_value: dto.discount_value,
      usage_limit: dto.usage_limit,
      valid_from: dto.valid_from,
      valid_until: dto.valid_until,
    };

    await connection.commit();

    void logCouponActivity({
      actorId,
      actorRole,
      action: 'coupon.updated',
      couponId: id,
      metadata: { oldValue: oldSnapshot, newValue: newSnapshot },
    });

    const updated = await getCouponById(id);
    if (!updated) {
      throw new ApiError(500, 'Coupon missing after update');
    }
    return updated;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* ignore */
    }
    if (error?.code === 'ER_DUP_ENTRY') {
      throw new ApiError(409, 'A coupon with this code already exists', {
        code: 'COUPON_CODE_TAKEN',
        field: 'code',
      });
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * @param {{ couponId: number, actorId: number, actorRole?: string }}
 */
export async function activateCoupon({ couponId, actorId, actorRole }) {
  return setCouponActiveState({ couponId, isActive: true, actorId, actorRole });
}

/**
 * @param {{ couponId: number, actorId: number, actorRole?: string }}
 */
export async function deactivateCoupon({ couponId, actorId, actorRole }) {
  return setCouponActiveState({ couponId, isActive: false, actorId, actorRole });
}

async function setCouponActiveState({ couponId, isActive, actorId, actorRole }) {
  const id = Number(couponId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid coupon id');
  }

  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, code, course_id, discount_type, discount_value, usage_limit, used_count, valid_from, valid_until, is_active
       FROM coupons
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );
    const existing = rows[0];
    if (!existing) {
      throw new ApiError(404, 'Coupon not found');
    }

    const wasActive = Boolean(existing.is_active);
    if (wasActive === isActive) {
      await connection.commit();
      return getCouponById(id);
    }

    const oldSnapshot = snapshotCoupon(existing);

    await connection.query(
      `UPDATE coupons
       SET is_active = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [isActive, actorId, id]
    );

    const newSnapshot = { ...oldSnapshot, is_active: isActive };

    await connection.commit();

    void logCouponActivity({
      actorId,
      actorRole,
      action: isActive ? 'coupon.activated' : 'coupon.deactivated',
      couponId: id,
      metadata: { oldValue: oldSnapshot, newValue: newSnapshot },
    });

    return getCouponById(id);
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
}
