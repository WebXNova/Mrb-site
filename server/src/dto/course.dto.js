/**
 * Course API serializers — DB Row → normalizeCourseRow → toCoursePublicApi | toCourseAdminApi → HTTP JSON (snake_case).
 * Legacy DB columns are ignored in normalizeCourseRow and never appear in API JSON.
 *
 * Catalog rows are read with a LEFT JOIN on `course_pricing` and carry prefixed
 * `cp_*` columns. The DTO extracts those into a nested `pricing` object via
 * `toCoursePricingPublicDto`; rows without an effective pricing row expose
 * `pricing: null` so the API contract stays stable for clients.
 */

import { toCoursePricingPublicDto } from './coursePricing.dto.js';

const LEVEL_ALLOWED = ['beginner', 'intermediate', 'advanced'];

/** @param {unknown} raw */
export function normalizeCourseLevel(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (LEVEL_ALLOWED.includes(s)) return /** @type {'beginner'|'intermediate'|'advanced'} */ (s);
  if (/^adv/.test(s) || s.includes('advanced') || s.includes('expert')) return 'advanced';
  if (s.includes('intermediate') || s.includes('medium') || /^inter\b/.test(s)) return 'intermediate';
  return 'beginner';
}

/** @param {string} description */
export function deriveShortDescription(description, maxLen = 160) {
  const t = String(description ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return null;
  if (t.length <= maxLen) return t;
  let cut = t.slice(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.55) cut = cut.slice(0, lastSpace);
  return `${cut.trim()}…`;
}

/** @param {unknown} v */
function toIsoTimestamp(v) {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  const d = new Date(typeof v === 'string' || typeof v === 'number' ? v : String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Resolve thumbnail from DB column or accepted write-time aliases (stripped from output).
 * @param {Record<string, unknown>} row
 */
function resolveThumbnailUrl(row) {
  const v =
    row.image_url ??
    row.thumbnail_url ??
    row.thumbnail ??
    row.cover_image ??
    null;
  if (v == null || v === '') return null;
  return String(v);
}

/**
 * Resolve short_description: stored column, else derive from full description.
 * @param {Record<string, unknown>} row
 */
function resolveShortDescription(row) {
  const raw = row.short_description;
  if (raw != null && String(raw).trim() !== '') return String(raw).trim();
  return deriveShortDescription(String(row.description ?? ''));
}

/**
 * Resolve nested `pricing` from joined `cp_*` columns. Returns null when the
 * catalog query did not match any effective pricing row.
 *
 * @param {Record<string, unknown>} row
 */
function resolvePricing(row) {
  if (row.cp_id == null) return null;
  return toCoursePricingPublicDto({
    pricing_type: row.cp_pricing_type,
    price_amount: row.cp_price_amount,
    original_price_amount: row.cp_original_price_amount,
    currency_code: row.cp_currency_code,
  });
}

/**
 * Parse a courses table row from minimal SELECT (or compatible superset — forbidden keys ignored).
 *
 * @param {Record<string, unknown>|null|undefined} row
 */
export function normalizeCourseRow(row) {
  if (!row) return null;
  const id = Number(row.id);
  const createdByRaw = row.created_by != null && row.created_by !== '' ? Number(row.created_by) : null;
  return {
    id: Number.isFinite(id) ? id : row.id,
    title: row.title ?? '',
    description: row.description ?? '',
    short_description: resolveShortDescription(row),
    level: normalizeCourseLevel(row.level),
    thumbnail_url: resolveThumbnailUrl(row),
    is_active: row.is_active !== undefined && row.is_active !== null ? !!row.is_active : true,
    created_by: Number.isFinite(createdByRaw) ? createdByRaw : null,
    pricing: resolvePricing(row),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

/**
 * Canonical public course JSON (no created_by, no is_active).
 * @param {ReturnType<typeof normalizeCourseRow>|null} n
 */
export function toCoursePublicApi(n) {
  if (!n) return null;
  return {
    id: n.id,
    title: n.title,
    description: n.description,
    short_description: n.short_description,
    level: n.level,
    thumbnail_url: n.thumbnail_url,
    pricing: n.pricing ?? null,
    created_at: toIsoTimestamp(n.created_at) ?? '',
    updated_at: toIsoTimestamp(n.updated_at) ?? '',
  };
}

/**
 * Canonical admin course JSON (includes is_active, created_by).
 * @param {ReturnType<typeof normalizeCourseRow>|null} n
 */
export function toCourseAdminApi(n) {
  if (!n) return null;
  const pub = toCoursePublicApi(n);
  if (!pub) return null;
  return {
    ...pub,
    is_active: n.is_active,
    created_by: n.created_by != null && Number.isFinite(Number(n.created_by)) ? Number(n.created_by) : null,
  };
}

export function toCoursePublicDto(row) {
  return toCoursePublicApi(normalizeCourseRow(row));
}

export function toCourseAdminDto(row) {
  return toCourseAdminApi(normalizeCourseRow(row));
}
