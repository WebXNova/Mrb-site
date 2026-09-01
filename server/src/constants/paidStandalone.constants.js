/** Paid standalone test product — never a course enrollment. */

export const PAID_STANDALONE_ACCESS_TYPE = 'paid_standalone';

export const STANDALONE_ORDER_STATUS = Object.freeze({
  PENDING: 'pending',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
});

export const STANDALONE_SEAT_STATUS = Object.freeze({
  NONE: 'none',
  CONFIRMED: 'confirmed',
  RELEASED: 'released',
});

export const STANDALONE_PAYMENT_STATUS = Object.freeze({
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

export const DEFAULT_PAID_STANDALONE_PRICE_PKR = 500;
