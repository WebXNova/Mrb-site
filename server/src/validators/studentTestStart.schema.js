/**
 * @param {unknown} value
 */
export function parseStudentTestIdParam(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: { code: 'INVALID_TEST_ID' } };
  }
  return { ok: true, id };
}
