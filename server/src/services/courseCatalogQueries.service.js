import { mysqlPool } from '../config/mysql.js';

/**
 * Minimal qualified columns for course identity + display metadata. Legacy
 * marketing columns left over from earlier versions are intentionally never
 * selected — the application layer treats them as inert.
 */
export const COURSE_CORE_COLUMNS_QUALIFIED = `
  c.id, c.title, c.description, c.short_description, c.level, c.image_url,
  c.start_date, c.end_date, c.admission_status, c.finished_at,
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

export const PUBLIC_CATALOG_WHERE = `
  c.is_active = TRUE
  AND c.status = 'published'
  AND c.admission_status = 'OPEN'
`;

/** Published + active only — does not consult admission (instructional / enrolled reads). */
export const ACTIVE_PUBLISHED_WHERE = `c.is_active = TRUE AND c.status = 'published'`;

function catalogWhereClause({ activeOnly = false, catalogVisible = false } = {}) {
  if (catalogVisible) return `WHERE ${PUBLIC_CATALOG_WHERE}`;
  if (activeOnly) return `WHERE ${ACTIVE_PUBLISHED_WHERE}`;
  return '';
}

function buildCatalogSelect({ activeOnly = false, catalogVisible = false } = {}) {
  return `
    SELECT ${COURSE_CORE_COLUMNS_QUALIFIED}, ${PRICING_PROJECTION}
    FROM courses c
    ${EFFECTIVE_PRICING_JOIN}
    ${catalogWhereClause({ activeOnly, catalogVisible })}
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

function buildCatalogSelectCoreOnly({ activeOnly = false, catalogVisible = false } = {}) {
  return `
    SELECT ${COURSE_CORE_COLUMNS_QUALIFIED}
    FROM courses c
    ${catalogWhereClause({ activeOnly, catalogVisible })}
  `;
}

export async function listActiveCourseRowsWithoutPricing() {
  const [rows] = await mysqlPool.query(
    `${buildCatalogSelectCoreOnly({ catalogVisible: true })} ORDER BY c.created_at DESC`
  );
  return rows;
}

function isMissingCategorySchemaError(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  return (
    code === 'ER_NO_SUCH_TABLE' ||
    code === 'ER_BAD_FIELD_ERROR' ||
    msg.includes('course_category')
  );
}

/**
 * @param {{ categoryId?: number|null }} [opts]
 */
function buildActiveCatalogQuery({ categoryId = null } = {}) {
  const params = [];
  let categoryJoin = '';
  if (categoryId != null) {
    const cid = Number(categoryId);
    if (Number.isInteger(cid) && cid > 0) {
      categoryJoin = `
        INNER JOIN course_category_map ccm ON ccm.course_id = c.id
        INNER JOIN course_categories cc ON cc.id = ccm.category_id AND cc.is_active = TRUE AND cc.id = ?
      `;
      params.push(cid);
    }
  }
  return { categoryJoin, params };
}

/**
 * @param {{ categoryId?: number|null }} [opts]
 */
export async function listActiveCourseRows(opts = {}) {
  const { categoryJoin, params } = buildActiveCatalogQuery(opts);
  try {
    const [rows] = await mysqlPool.query(
      `${buildCatalogSelect({ catalogVisible: true }).replace(
        'FROM courses c',
        `FROM courses c${categoryJoin}`
      )} ORDER BY c.created_at DESC`,
      params
    );
    return rows;
  } catch (error) {
    if (isMissingCategorySchemaError(error)) {
      if (opts.categoryId != null) return [];
      if (!isMissingPricingSchemaError(error)) throw error;
    }
    if (!isMissingPricingSchemaError(error)) throw error;
    const [rows] = await mysqlPool.query(
      `${buildCatalogSelectCoreOnly({ catalogVisible: true }).replace(
        'FROM courses c',
        `FROM courses c${categoryJoin}`
      )} ORDER BY c.created_at DESC`,
      params
    );
    return rows;
  }
}

export async function getCourseRowById(courseId, { activeOnly = false, catalogVisible = false } = {}) {
  const extra = catalogVisible
    ? ` AND ${PUBLIC_CATALOG_WHERE}`
    : activeOnly
      ? ` AND ${ACTIVE_PUBLISHED_WHERE}`
      : '';
  const baseSql = `
    SELECT ${COURSE_CORE_COLUMNS_QUALIFIED}, ${PRICING_PROJECTION}
    FROM courses c
    ${EFFECTIVE_PRICING_JOIN}
    WHERE c.id = ?${extra}
    LIMIT 1
  `;
  const fallbackSql = `
    SELECT ${COURSE_CORE_COLUMNS_QUALIFIED}
    FROM courses c
    WHERE c.id = ?${extra}
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
