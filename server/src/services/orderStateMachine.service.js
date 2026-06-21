/**
 * Strict order status transitions for payment checkout.
 *
 * Allowed:
 *   pending → paid | failed | cancelled
 *   paid → refunded
 *
 * Forbidden:
 *   cancelled | failed | refunded → paid
 *   cancelled | failed → refunded
 */

/** @typedef {'pending'|'paid'|'failed'|'cancelled'|'refunded'} OrderStatus */

/** @type {Readonly<Record<OrderStatus, ReadonlySet<OrderStatus>>>} */
export const ALLOWED_ORDER_TRANSITIONS = Object.freeze({
  pending: Object.freeze(new Set(['paid', 'failed', 'cancelled'])),
  paid: Object.freeze(new Set(['refunded'])),
  failed: Object.freeze(new Set()),
  cancelled: Object.freeze(new Set()),
  refunded: Object.freeze(new Set()),
});

/** Statuses that must never receive fulfillment / paid promotion. */
export const TERMINAL_NON_PAYABLE_ORDER_STATUSES = Object.freeze(
  new Set(['cancelled', 'failed', 'refunded'])
);

/**
 * @param {unknown} status
 * @returns {status is OrderStatus}
 */
export function isKnownOrderStatus(status) {
  return (
    status === 'pending' ||
    status === 'paid' ||
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'refunded'
  );
}

/**
 * @param {unknown} from
 * @param {unknown} to
 * @returns {boolean}
 */
export function canTransitionOrderStatus(from, to) {
  const fromStatus = String(from || '').toLowerCase();
  const toStatus = String(to || '').toLowerCase();
  if (!isKnownOrderStatus(fromStatus) || !isKnownOrderStatus(toStatus)) return false;
  if (fromStatus === toStatus) return true;
  return ALLOWED_ORDER_TRANSITIONS[fromStatus].has(toStatus);
}

/**
 * @param {unknown} from
 * @param {unknown} to
 * @param {string} [context]
 */
export function assertOrderTransitionAllowed(from, to, context = 'order') {
  if (canTransitionOrderStatus(from, to)) return;
  const err = new Error(
    `${context}: illegal order transition ${String(from)} → ${String(to)}`
  );
  err.code = 'ORDER_TRANSITION_FORBIDDEN';
  throw err;
}

/**
 * @param {unknown} status
 * @returns {boolean}
 */
export function isOrderPayableFromWebhook(status) {
  return String(status || '').toLowerCase() === 'pending';
}

/**
 * @param {unknown} status
 * @returns {boolean}
 */
export function isTerminalNonPayableOrderStatus(status) {
  return TERMINAL_NON_PAYABLE_ORDER_STATUSES.has(String(status || '').toLowerCase());
}
