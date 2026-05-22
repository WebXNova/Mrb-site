import { request } from './requestClient.js';

function enrollmentApiErrorMessage(data, httpStatus) {
  if (!data || typeof data !== 'object') {
    return httpStatus ? `Enrollment submission failed (HTTP ${httpStatus}).` : '';
  }
  if (data.success === false && data.error && typeof data.error === 'object' && typeof data.error.message === 'string') {
    return data.error.message.trim();
  }
  if (typeof data.message === 'string' && data.message.trim()) return data.message;
  const fieldErrors = data.details?.fieldErrors;
  if (fieldErrors && typeof fieldErrors === 'object') {
    for (const key of Object.keys(fieldErrors)) {
      const arr = fieldErrors[key];
      const first = Array.isArray(arr) ? arr.find((m) => typeof m === 'string' && m.trim()) : arr;
      if (typeof first === 'string' && first.trim()) return first;
    }
  }
  return httpStatus ? `Enrollment submission failed (HTTP ${httpStatus}).` : '';
}

function studentRequest(path, options = {}) {
  return request(path, { ...options, authScope: 'student' });
}

function studentUploadRequest(path, formData, options = {}) {
  return request(path, {
    ...options,
    authScope: 'student',
    method: 'POST',
    body: formData,
  });
}

export const studentApi = {
  register: (payload) =>
    studentRequest('/auth/student/register', { method: 'POST', body: payload, retryOnUnauthorized: false }),
  login: (payload) =>
    studentRequest('/auth/student/login', { method: 'POST', body: payload, retryOnUnauthorized: false }),
  forgotPassword: (payload) =>
    studentRequest('/auth/student/forgot-password', { method: 'POST', body: payload, retryOnUnauthorized: false }),
  resetPassword: (payload) =>
    studentRequest('/auth/student/reset-password', { method: 'POST', body: payload, retryOnUnauthorized: false }),
  verifyEmail: (token) =>
    studentRequest('/auth/verify-email', { method: 'POST', body: { token }, retryOnUnauthorized: false }),
  resendVerification: (payload) =>
    studentRequest('/auth/resend-verification', { method: 'POST', body: payload, retryOnUnauthorized: false }),
  verifyMrbEnrollment: (payload) =>
    studentRequest('/auth/student/verify-mrb-enrollment', { method: 'POST', body: payload, retryOnUnauthorized: true }),
  logout: () => studentRequest('/auth/student/logout', { method: 'POST', retryOnUnauthorized: false }),
  me: () => studentRequest('/auth/student/me', { retryOnUnauthorized: true }),
  dashboard: () => studentRequest('/student/dashboard'),
  questions: () => studentRequest('/student/questions'),
  questionDetail: (id) => studentRequest(`/student/questions/${id}`),
  createQuestion: (payload) => studentRequest('/student/questions', { method: 'POST', body: payload }),
  uploadQuestionImage: (file) => {
    const formData = new FormData();
    formData.append('image', file);
    return studentUploadRequest('/student/questions/attachment', formData);
  },
  notifications: () => studentRequest('/student/notifications'),
  resultDetail: (attemptId) => studentRequest(`/student/results/${attemptId}`),
  submitEnrollment: (payload) =>
    studentRequest('/enrollments/draft', { method: 'POST', body: payload, retryOnUnauthorized: true }),
  enrollmentStatus: () => studentRequest('/enrollments/me'),
};
