/**
 * Course pricing API serializer — DB Row → public nested object.
 * Public shape (intentionally minimal, no DB column names, no internal id):
 *   {
 *     type: 'free' | 'one_time',
 *     currency: 'PKR',
 *     price_amount: number,
 *     original_price_amount: number | null
 *   }
 */

const SUPPORTED_TYPES = new Set(['free', 'one_time', 'subscription']);

/** @param {unknown} v */
function toIntOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Map a course_pricing row (or compatible joined columns) to the public DTO.
 * Returns null when the row is missing — callers expose pricing as `null` when
 * no effective row exists, so the API contract stays stable.
 *
 * @param {Record<string, unknown>|null|undefined} row
 */
export function toCoursePricingPublicDto(row) {
  if (!row) return null;
  const rawType = String(row.pricing_type ?? '').toLowerCase().trim();
  const type = SUPPORTED_TYPES.has(rawType) ? rawType : 'one_time';
  const priceAmount = toIntOrNull(row.price_amount);
  const originalPriceAmount = toIntOrNull(row.original_price_amount);
  const currency = String(row.currency_code ?? 'PKR').toUpperCase();
  const safePrice = priceAmount == null ? 0 : Math.max(0, priceAmount);
  return {
    type,
    currency,
    price_amount: safePrice,
    // Only surface `original_price_amount` when it is strictly greater than the
    // current price — equal or lower values are not a meaningful "original".
    original_price_amount:
      originalPriceAmount == null || originalPriceAmount <= safePrice ? null : originalPriceAmount,
  };
}

/**
 * Map a course_pricing row to an admin DTO (snake_case, no leaked internal ids).
 * Used by the admin pricing PUT response so the editor can render the saved row.
 *
 * @param {Record<string, unknown>|null|undefined} row
 */
export function toCoursePricingAdminDto(row) {
  if (!row) return null;
  const pub = toCoursePricingPublicDto(row);
  if (!pub) return null;
  return {
    ...pub,
    is_active: row.is_active == null ? false : Boolean(Number(row.is_active)),
    enrollment_visible: row.enrollment_visible == null ? true : Boolean(Number(row.enrollment_visible)),
    public_purchase_visible: row.public_purchase_visible == null ? true : Boolean(Number(row.public_purchase_visible)),
    starts_at: row.starts_at instanceof Date ? row.starts_at.toISOString() : (row.starts_at ?? null),
    ends_at: row.ends_at instanceof Date ? row.ends_at.toISOString() : (row.ends_at ?? null),
  };
}
