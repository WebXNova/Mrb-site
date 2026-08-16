/**
 * Display helpers for coupon usage on manual payment submissions (admin read-only).
 */

/**
 * @param {{ couponCode?: string|null, discountApplied?: number|null, originalAmount?: number|null, couponDiscountType?: string|null, manualPaymentCouponCode?: string|null, manualPaymentDiscountApplied?: number|null, manualPaymentOriginalAmount?: number|null, manualPaymentCouponDiscountType?: string|null }} row
 */
export function submissionUsedCoupon(row) {
  if (!row) return false;
  const code = row.couponCode ?? row.manualPaymentCouponCode ?? null;
  const discount = row.discountApplied ?? row.manualPaymentDiscountApplied;
  const original = row.originalAmount ?? row.manualPaymentOriginalAmount;
  return Boolean(code) || (discount != null && original != null && Number(discount) > 0);
}

/**
 * @param {{ couponCode?: string|null, manualPaymentCouponCode?: string|null }} row
 */
export function submissionCouponCode(row) {
  return row?.couponCode ?? row?.manualPaymentCouponCode ?? null;
}

/**
 * @param {{ discountApplied?: number|null, manualPaymentDiscountApplied?: number|null }} row
 */
export function submissionDiscountApplied(row) {
  const value = row?.discountApplied ?? row?.manualPaymentDiscountApplied;
  return value == null ? null : Number(value);
}

/**
 * @param {{ originalAmount?: number|null, manualPaymentOriginalAmount?: number|null }} row
 */
export function submissionOriginalAmount(row) {
  const value = row?.originalAmount ?? row?.manualPaymentOriginalAmount;
  return value == null ? null : Number(value);
}

/**
 * @param {{ couponDiscountType?: string|null, manualPaymentCouponDiscountType?: string|null }} row
 */
export function submissionCouponDiscountType(row) {
  const type = row?.couponDiscountType ?? row?.manualPaymentCouponDiscountType ?? null;
  return type === 'flat' || type === 'percentage' ? type : null;
}

/**
 * @param {number} amount
 */
export function formatAdminPkr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `PKR ${n.toLocaleString('en-PK')}`;
}

/**
 * Off-label derived from submission-time snapshot amounts + stored discount type.
 * @param {'flat'|'percentage'|null} discountType
 * @param {number|null} discountApplied
 * @param {number|null} originalAmount
 */
export function formatCouponOffLabel(discountType, discountApplied, originalAmount) {
  const discount = Number(discountApplied);
  const original = Number(originalAmount);
  if (!Number.isFinite(discount) || discount <= 0) return 'discount applied';
  if (discountType === 'percentage' && Number.isFinite(original) && original > 0) {
    const pct = Math.round((discount / original) * 100);
    return `${pct}% off`;
  }
  return `${formatAdminPkr(discount)} off`;
}

/**
 * @param {Parameters<typeof submissionUsedCoupon>[0]} row
 */
export function formatCouponAppliedSummary(row) {
  if (!submissionUsedCoupon(row)) return null;

  const code = submissionCouponCode(row) || 'Coupon';
  const discountType = submissionCouponDiscountType(row);
  const discountApplied = submissionDiscountApplied(row);
  const originalAmount = submissionOriginalAmount(row);
  const offLabel = formatCouponOffLabel(discountType, discountApplied, originalAmount);

  const discountedAmount =
    Number.isFinite(originalAmount) && Number.isFinite(discountApplied)
      ? originalAmount - discountApplied
      : null;

  return {
    code,
    offLabel,
    originalAmount,
    discountedAmount,
    line: `Coupon applied: ${code} (${offLabel}) — Original: ${formatAdminPkr(originalAmount)} → Discounted: ${formatAdminPkr(discountedAmount)}`,
  };
}
