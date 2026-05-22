import { request } from './requestClient.js';

function studentRequest(path, options = {}) {
  return request(path, { ...options, authScope: 'student' });
}

export const paymentsApi = {
  createSession: ({ enrollmentId, courseId }) =>
    studentRequest('/payments/create-session', {
      method: 'POST',
      body: {
        enrollment_id: enrollmentId,
        course_id: courseId,
      },
    }),
};
