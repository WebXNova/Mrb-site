const WRAPPED = Symbol.for('mrb.asyncHandler');

/**
 * Forward rejected promises from async Express 4 middleware/handlers to `next(err)`.
 * Idempotent — wrapping twice is a no-op.
 *
 * @template {(...args: any[]) => any} T
 * @param {T} fn
 * @returns {T}
 */
export function asyncHandler(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('asyncHandler requires a function');
  }
  if (fn[WRAPPED]) {
    return fn;
  }

  function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  }

  wrapped[WRAPPED] = true;
  return /** @type {T} */ (wrapped);
}

export function isAsyncHandlerWrapped(fn) {
  return Boolean(fn && fn[WRAPPED]);
}
