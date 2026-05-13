/**
 * Unified JSON API envelopes for success and error responses.
 */

export function sendSuccess(res, data, status = 200, meta = null) {
  const body = { success: true, data: data === undefined ? null : data };
  if (meta && typeof meta === 'object') {
    Object.assign(body, meta);
  }
  return res.status(status).json(body);
}

export function sendError(res, status, code, message, extras = {}) {
  const body = {
    success: false,
    error: { code, message },
    ...extras,
  };
  return res.status(status).json(body);
}
