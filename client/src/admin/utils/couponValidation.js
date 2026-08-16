const CODE_MIN_LENGTH = 3;
const CODE_MAX_LENGTH = 32;
const CODE_PATTERN = /^[A-Z0-9_-]+$/;

/**
 * @param {string} raw
 */
export function normalizeCouponCodeInput(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase();
}

/**
 * @param {object} form
 * @param {{ price?: number|null }|null} [selectedCourse]
 */
export function validateCouponForm(form, selectedCourse = null) {
  const code = normalizeCouponCodeInput(form.code);
  if (code.length < CODE_MIN_LENGTH) {
    return `Code must be at least ${CODE_MIN_LENGTH} characters.`;
  }
  if (code.length > CODE_MAX_LENGTH) {
    return `Code must be at most ${CODE_MAX_LENGTH} characters.`;
  }
  if (!CODE_PATTERN.test(code)) {
    return 'Code may only contain letters, numbers, hyphens, and underscores.';
  }

  const courseId = Number(form.course_id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return 'Select a course.';
  }

  const discountType = form.discount_type;
  if (discountType !== 'flat' && discountType !== 'percentage') {
    return 'Select a discount type.';
  }

  const discountValue = Number(form.discount_value);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return 'Discount value must be greater than zero.';
  }
  if (discountType === 'percentage' && discountValue > 100) {
    return 'Percentage discount cannot exceed 100%.';
  }
  if (discountType === 'flat') {
    const price = selectedCourse?.price;
    if (price != null && price > 0 && discountValue > price) {
      return 'Flat discount cannot exceed the course price.';
    }
  }

  const usageLimit = Number(form.usage_limit);
  if (!Number.isInteger(usageLimit) || usageLimit < 1) {
    return 'Usage limit must be at least 1.';
  }

  const validFrom = String(form.valid_from ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) {
    return 'Valid-from date is required.';
  }

  const validUntilRaw = String(form.valid_until ?? '').trim();
  if (validUntilRaw && !/^\d{4}-\d{2}-\d{2}$/.test(validUntilRaw)) {
    return 'Expiry date must be YYYY-MM-DD.';
  }
  if (validUntilRaw && validUntilRaw < validFrom) {
    return 'Expiry date must be on or after the valid-from date.';
  }

  return '';
}

/**
 * @param {'flat'|'percentage'} discountType
 * @param {number} discountValue
 */
export function formatCouponDiscountLabel(discountType, discountValue) {
  if (discountType === 'percentage') {
    return `${Number(discountValue)}% off`;
  }
  return `PKR ${Number(discountValue).toLocaleString()} off`;
}

/**
 * @param {string|null|undefined} dateStr YYYY-MM-DD
 */
export function formatCouponDate(dateStr) {
  if (!dateStr) return '—';
  const parts = String(dateStr).split('-').map(Number);
  if (parts.length !== 3) return dateStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}
