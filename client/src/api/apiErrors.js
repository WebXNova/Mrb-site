/** Attach HTTP metadata for callers that must not treat all failures as logout. */
export function createHttpError(message, { status, refreshAlreadyTried } = {}) {
  const err = new Error(message);
  err.name = 'HttpRequestError';
  if (status != null) err.status = status;
  if (refreshAlreadyTried != null) err.refreshAlreadyTried = refreshAlreadyTried;
  return err;
}
