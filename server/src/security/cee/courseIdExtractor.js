/**
 * Extract course_id from HTTP request for strict entitlement binding.
 */

/**
 * @param {import('express').Request} req
 * @returns {number|null}
 */
export function extractRequestedCourseId(req) {
  const raw =
    req.params?.courseId ??
    req.params?.course_id ??
    req.query?.courseId ??
    req.query?.course_id ??
    req.body?.courseId ??
    req.body?.course_id;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return null;
  }
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
