/**
 * Maps canonical course API objects (snake_case) onto list/detail UI props.
 * Public contract: id, title, description, short_description, level, thumbnail_url, pricing, timestamps.
 */

import { resolveCourseThumbnailUrl } from '../utils/mediaUrl';
import { extractCourseAdmission } from './courseAdmissionPresentation';

const SUPPORTED_PRICING_TYPES = new Set(['free', 'one_time']);

function truncateSummary(text, maxLen = 220) {
  const t = String(text || '').trim();
  if (!t) return '';
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1).trim()}…`;
}

/** Pull the nested pricing object off a catalog API course, normalizing shape. */
export function extractCoursePricing(course) {
  const raw = course && typeof course === 'object' ? course.pricing : null;
  if (!raw || typeof raw !== 'object') return null;
  const rawType = typeof raw.type === 'string' ? raw.type.toLowerCase() : '';
  const type = SUPPORTED_PRICING_TYPES.has(rawType) ? rawType : 'one_time';
  const amount = Number(raw.price_amount);
  const original = raw.original_price_amount == null ? null : Number(raw.original_price_amount);
  const currency = typeof raw.currency === 'string' && raw.currency ? raw.currency.toUpperCase() : 'PKR';
  return {
    type,
    currency,
    price_amount: Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0,
    original_price_amount:
      original != null && Number.isFinite(original) && original >= (Number.isFinite(amount) ? amount : 0)
        ? Math.trunc(original)
        : null,
  };
}

/** @param {Record<string, unknown>} course from `/api/courses/public` or `/api/courses/:id` */
export function mapCatalogCourseToCardProps(course) {
  if (!course || typeof course !== 'object') return null;
  const id = typeof course.id === 'number' ? course.id : Number(course.id);
  const title = typeof course.title === 'string' ? course.title : '';
  const description = typeof course.description === 'string' ? course.description : '';
  const shortDesc =
    typeof course.short_description === 'string' && course.short_description.trim()
      ? course.short_description.trim()
      : '';
  const summarySource = shortDesc || description;
  const thumbnailUrl = resolveCourseThumbnailUrl(course.thumbnail_url);
  const level = typeof course.level === 'string' ? course.level : 'beginner';

  if (!Number.isFinite(id) || id <= 0) return null;

  const admission = extractCourseAdmission(course);

  return {
    id,
    title,
    summary: truncateSummary(summarySource, 260),
    thumbnail_url: thumbnailUrl,
    level,
    pricing: extractCoursePricing(course),
    ...admission,
  };
}

/** @param {Record<string, unknown>} course from `/api/courses/:id` */
export function mapCatalogCourseToDetailProps(course) {
  const base = mapCatalogCourseToCardProps(course);
  if (!base) return null;
  const description = typeof course.description === 'string' ? course.description : '';
  const shortDesc =
    typeof course.short_description === 'string' && course.short_description.trim()
      ? course.short_description.trim()
      : '';
  const summarySource = shortDesc || description || base.summary;
  return {
    ...base,
    summary: truncateSummary(summarySource, 2000),
    description,
  };
}

/**
 * Display-only helper: builds a small `{ amount, original, discount, isFree, currency }`
 * struct from a pricing object. The discount is computed at render time only and is
 * never persisted — UI must not store derived values as if they were business truth.
 */
export function buildPricingDisplay(pricing) {
  if (!pricing) return null;
  const amount = Number.isFinite(pricing.price_amount) ? pricing.price_amount : 0;
  const original = pricing.original_price_amount;
  const hasOriginal = Number.isFinite(original) && original > amount;
  return {
    isFree: pricing.type === 'free' || amount === 0,
    currency: pricing.currency || 'PKR',
    amount,
    original: hasOriginal ? original : null,
    discount: hasOriginal ? original - amount : 0,
  };
}

export function normalizeCatalogFilterKey(raw) {
  if (!raw || raw === 'all') return 'all';
  return String(raw).toLowerCase().trim();
}

/** Query param filter: matches title, summary, level tokens (legacy tab ids). */
export function filterCoursesByCatalogFilter(courseCardProps, rawFilter) {
  const key = normalizeCatalogFilterKey(rawFilter);
  if (key === 'all' || !Array.isArray(courseCardProps)) return courseCardProps || [];
  return courseCardProps.filter((c) => {
    const title = String(c.title ?? '').toLowerCase();
    const summary = String(c.summary ?? '').toLowerCase();
    const level = String(c.level ?? '').toLowerCase();
    return title.includes(key) || summary.includes(key) || level.includes(key) || key.includes(title.slice(0, 8));
  });
}
