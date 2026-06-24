import { mysqlPool } from '../config/mysql.js';

/**
 * Minimal qualified columns for course identity + display metadata. Legacy
 * marketing columns left over from earlier versions are intentionally never
 * selected — the application layer treats them as inert.
 */
export const COURSE_CORE_COLUMNS_QUALIFIED = `
  c.id, c.title, c.description, c.short_description, c.level, c.image_url,
  c.start_date, c.end_date, c.admission_status,
  c.is_active, c.status, c.created_by, c.created_at, c.updated_at
`;

/**
 * Joined pricing columns (prefixed `cp_`). The DTO layer detects `cp_id` and
 * builds the nested `pricing` object; if the JOIN finds no effective row, all
 * `cp_*` columns are NULL and the DTO surfaces `pricing: null`.
 */
const PRICING_PROJECTION = `
  cp.id AS cp_id,
  cp.price_amount AS cp_price_amount,
  cp.original_price_amount AS cp_original_price_amount,
  cp.currency_code AS cp_currency_code,
  cp.pricing_type AS cp_pricing_type
`;

/**
 * Deterministic effective-pricing join: at most one pricing row per course.
 * Matches `is_active = 1` and the current time window. Repeated active rows
 * would still yield a single row (smallest id) to keep reads stable.
 */
const EFFECTIVE_PRICING_JOIN = `
  LEFT JOIN course_pricing cp ON cp.id = (
    SELECT MIN(cp_pick.id)
    FROM course_pricing cp_pick
    WHERE cp_pick.course_id = c.id
      AND cp_pick.is_active = 1
      AND (cp_pick.starts_at IS NULL OR cp_pick.starts_at <= UTC_TIMESTAMP())
      AND (cp_pick.ends_at IS NULL OR cp_pick.ends_at > UTC_TIMESTAMP())
  )
`;

function buildCatalogSelect({ activeOnly = false } = {}) {
  return `
    SELECT ${COURSE_CORE_COLUMNS_QUALIFIED}, ${PRICING_PROJECTION}
    FROM courses c
    ${EFFECTIVE_PRICING_JOIN}
    ${activeOnly ? "WHERE c.is_active = TRUE AND c.status = 'published'" : ''}
  `;
}

export async function listAllCourseRows() {
  try {
    const [rows] = await mysqlPool.query(
      `${buildCatalogSelect({ activeOnly: false })} ORDER BY c.created_at DESC`
    );
    return rows;
  } catch (error) {
    if (!isMissingPricingSchemaError(error)) throw error;
    const [rows] = await mysqlPool.query(
      `${buildCatalogSelectCoreOnly({ activeOnly: false })} ORDER BY c.created_at DESC`
    );
    return rows;
  }
}

function isMissingPricingSchemaError(error) {
  const code = String(error?.code || '');
  return code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR';
}

function buildCatalogSelectCoreOnly({ activeOnly = false } = {}) {
  return `
    SELECT ${COURSE_CORE_COLUMNS_QUALIFIED}
    FROM courses c
    ${activeOnly ? "WHERE c.is_active = TRUE AND c.status = 'published'" : ''}
  `;
}

export async function listActiveCourseRowsWithoutPricing() {
  const [rows] = await mysqlPool.query(
    `${buildCatalogSelectCoreOnly({ activeOnly: true })} ORDER BY c.created_at DESC`
  );
  return rows;
}

export async function listActiveCourseRows() {
  try {
    const [rows] = await mysqlPool.query(
      `${buildCatalogSelect({ activeOnly: true })} ORDER BY c.created_at DESC`
    );
    return rows;
  } catch (error) {
    if (!isMissingPricingSchemaError(error)) throw error;
    return listActiveCourseRowsWithoutPricing();
  }
}

export async function getCourseRowById(courseId, { activeOnly = false } = {}) {
  const baseSql = `
    SELECT ${COURSE_CORE_COLUMNS_QUALIFIED}, ${PRICING_PROJECTION}
    FROM courses c
    ${EFFECTIVE_PRICING_JOIN}
    WHERE c.id = ?${activeOnly ? " AND c.is_active = TRUE AND c.status = 'published'" : ''}
    LIMIT 1
  `;
  const fallbackSql = `
    SELECT ${COURSE_CORE_COLUMNS_QUALIFIED}
    FROM courses c
    WHERE c.id = ?${activeOnly ? " AND c.is_active = TRUE AND c.status = 'published'" : ''}
    LIMIT 1
  `;

  try {
    const [rows] = await mysqlPool.query(baseSql, [courseId]);
    return rows[0] || null;
  } catch (error) {
    if (!isMissingPricingSchemaError(error)) throw error;
    const [rows] = await mysqlPool.query(fallbackSql, [courseId]);
    return rows[0] || null;
  }
}
