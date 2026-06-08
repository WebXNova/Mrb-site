/**
 * @param {unknown} value
 */
export function parseStudentAttemptIdParam(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: { code: 'INVALID_ATTEMPT_ID' } };
  }
  return { ok: true, id };
}
