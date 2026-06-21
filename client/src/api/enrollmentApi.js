import { request } from './requestClient.js';
import { parseApiError } from '../utils/errorHandler.js';
import { normalizeEnrollmentRow, normalizeEnrollmentState } from './enrollmentNormalizers.js';

export { normalizeEnrollmentRow, normalizeEnrollmentState } from './enrollmentNormalizers.js';

function studentRequest(path, options = {}) {
  return request(path, { ...options, authScope: 'student' });
}

/**
 * Student enrollment API — simplified admission-aware endpoints.
 */
export const enrollmentApi = {
  /** GET /api/enrollments/me */
  listMine: async () => {
    const response = await studentRequest('/enrollments/me');
    const rows = Array.isArray(response?.data?.enrollments) ? response.data.enrollments : [];
    return {
      ...response,
      data: {
        enrollments: rows.map(normalizeEnrollmentRow).filter(Boolean),
      },
    };
  },

  /** GET /api/enrollments/prefill-data?targetCourseId=&sourceEnrollmentId= */
  getPrefillData: async ({ targetCourseId, sourceEnrollmentId } = {}) => {
    const id = Number(String(targetCourseId || '').trim());
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid target course id');
    }
    const query = new URLSearchParams({ targetCourseId: String(id) });
    if (sourceEnrollmentId != null && String(sourceEnrollmentId).trim() !== '') {
      query.set('sourceEnrollmentId', String(sourceEnrollmentId));
    }
    return studentRequest(`/enrollments/prefill-data?${query.toString()}`);
  },

  /** GET /api/enrollments/state/:courseId */
  getState: async (courseId) => {
    const id = Number(String(courseId || '').trim());
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid course id');
    }
    const response = await studentRequest(`/enrollments/state/${encodeURIComponent(String(id))}`);
    return {
      ...response,
      data: normalizeEnrollmentState(response?.data),
    };
  },

  /**
   * POST /api/enrollments — create enrollment (admission must be OPEN).
   * @throws {import('./apiErrors.js').HttpRequestError} with errorCode ADMISSIONS_CLOSED on 403
   */
  create: async (payload, options = {}) => {
    try {
      return await studentRequest('/enrollments', {
        method: 'POST',
        body: payload,
        retryOnUnauthorized: true,
        idempotencyKey: options.idempotencyKey,
      });
    } catch (err) {
      const parsed = parseApiError(err, { fallback: 'Enrollment submission failed.' });
      const next = err instanceof Error ? err : new Error(parsed.message);
      if (!next.errorCode && parsed.code) next.errorCode = parsed.code;
      if (!next.status && parsed.status) next.status = parsed.status;
      if (!next.message || next.message === 'Error') next.message = parsed.message;
      throw next;
    }
  },
};

/** @deprecated Use enrollmentApi.create */
export function submitEnrollment(payload, options) {
  return enrollmentApi.create(payload, options);
}
