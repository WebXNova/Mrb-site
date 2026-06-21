/**
 * Authoritative course pricing classification for enrollment and payment gates.
 * DB source of truth: course_pricing.pricing_type + price_amount (never client flags).
 */

/** @typedef {'free' | 'paid'} CoursePricingCategory */

export const ENROLLMENT_PRICING_CATEGORY = Object.freeze({
  FREE: 'free',
  PAID: 'paid',
});

const FREE_PRICING_TYPES = Object.freeze(new Set(['free']));
const PAID_PRICING_TYPES = Object.freeze(new Set(['one_time', 'subscription']));

/**
 * @param {string|null|undefined} pricingType
 * @returns {boolean}
 */
export function isFreeCoursePricingType(pricingType) {
  return FREE_PRICING_TYPES.has(String(pricingType || '').toLowerCase().trim());
}

/**
 * @param {string|null|undefined} pricingType
 * @returns {boolean}
 */
export function isPaidCoursePricingType(pricingType) {
  return PAID_PRICING_TYPES.has(String(pricingType || '').toLowerCase().trim());
}

/**
 * Classify effective pricing for enrollment (pure — no I/O).
 *
 * @param {{ type?: string, price_amount?: number }|null|undefined} pricing — public pricing DTO from DB
 * @returns {{ category: CoursePricingCategory|null, error: string|null }}
 */
export function classifyCoursePricingCategory(pricing) {
  if (!pricing || typeof pricing !== 'object') {
    return { category: null, error: 'pricing_not_configured' };
  }

  const type = String(pricing.type || '').toLowerCase().trim();
  const amount = Number(pricing.price_amount);

  if (isFreeCoursePricingType(type)) {
    if (!Number.isFinite(amount) || amount !== 0) {
      return { category: null, error: 'free_course_price_must_be_zero' };
    }
    return { category: ENROLLMENT_PRICING_CATEGORY.FREE, error: null };
  }

  if (isPaidCoursePricingType(type)) {
    if (!Number.isFinite(amount) || amount <= 0) {
      return { category: null, error: 'paid_course_price_must_be_positive' };
    }
    return { category: ENROLLMENT_PRICING_CATEGORY.PAID, error: null };
  }

  return { category: null, error: 'unknown_pricing_type' };
}
