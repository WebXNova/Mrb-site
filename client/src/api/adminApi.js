import { inferApiFailureMessage } from './apiErrors';
import { http } from './http';
import { getApiBaseUrl } from './runtimeConfig';

export const adminApi = {
  login: (payload) => http.post('/auth/login', payload, { retryOnUnauthorized: false }),
  logout: () => http.post('/auth/logout', {}, { retryOnUnauthorized: false }),
  logoutAll: () => http.post('/auth/logout-all', {}, { retryOnUnauthorized: false }),
  me: (token) => http.get('/auth/me', { token }),

  dashboard: (token) => http.get('/admin/dashboard', { token }),
  logs: (token) => http.get('/admin/logs', { token }),
  users: (token) => http.get('/admin/users', { token }),
  updateUserStatus: (token, userId, status) =>
    http.put(`/admin/users/${userId}/status`, { status }, { token }),

  courses: (token) => http.get('/courses/admin', { token }),
  createCourse: (token, payload) => http.post('/admin/courses', payload, { token }),
  createCourseWizard: (token, payload, options = {}) => 
    http.post('/admin/courses/wizard', payload, { 
      token, 
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
    }),
  updateCourse: (token, courseId, payload) =>
    http.put(`/admin/courses/${courseId}`, payload, { token }),
  coursePricing: (token, courseId) =>
    http.get(`/admin/courses/${courseId}/pricing`, { token }),
  updateCoursePricing: (token, courseId, payload) =>
    http.put(`/admin/courses/${courseId}/pricing`, payload, { token }),
  deleteCourse: (token, courseId, { purge = false, forceCascade = false } = {}) => {
    const sp = new URLSearchParams();
    if (purge) sp.set('purge', 'true');
    if (forceCascade) sp.set('forceCascade', 'true');
    const qs = sp.toString();
    return http.delete(`/admin/courses/${courseId}${qs ? `?${qs}` : ''}`, { token });
  },
  subjects: (token, courseId, { includeInactive = false } = {}) => {
    const qs = includeInactive ? '?includeInactive=true' : '';
    return http.get(`/admin/courses/${courseId}/subjects${qs}`, { token });
  },
  subject: (token, courseId, subjectId) =>
    http.get(`/admin/courses/${courseId}/subjects/${subjectId}`, { token }),
  createSubject: (token, courseId, payload) =>
    http.post(`/admin/courses/${courseId}/subjects`, payload, { token }),
  updateSubject: (token, courseId, subjectId, payload) =>
    http.put(`/admin/courses/${courseId}/subjects/${subjectId}`, payload, { token }),
  deleteSubject: (token, courseId, subjectId) =>
    http.delete(`/admin/courses/${courseId}/subjects/${subjectId}`, { token }),
  reorderSubjects: (token, courseId, orderedSubjectIds) =>
    http.put(`/admin/courses/${courseId}/subjects/reorder`, { orderedSubjectIds }, { token }),

  courseBatches: (token, courseId) => http.get(`/admin/courses/${courseId}/batches`, { token }),
  createCourseBatch: (token, courseId, payload) =>
    http.post(`/admin/courses/${courseId}/batches`, payload, { token }),
  updateCourseBatch: (token, batchId, payload) =>
    http.put(`/admin/batches/${batchId}`, payload, { token }),
  archiveCourseBatch: (token, batchId) =>
    http.post(`/admin/batches/${batchId}/archive`, {}, { token }),
  reactivateCourseBatch: (token, batchId) =>
    http.post(`/admin/batches/${batchId}/reactivate`, {}, { token }),
  uploadCourseImage: async (_token, file) => {
    const CSRF_COOKIE_NAME = 'csrf_token';
    const CSRF_HEADER_NAME = 'x-csrf-token';
    function readCookie(name) {
      if (typeof document === 'undefined') return '';
      const prefix = `${encodeURIComponent(name)}=`;
      const parts = document.cookie ? document.cookie.split('; ') : [];
      for (const part of parts) {
        if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
      }
      return '';
    }
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    const formData = new FormData();
    formData.append('image', file);
    const response = await fetch(`${getApiBaseUrl()}/admin/courses/upload-image`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
      },
      body: formData,
    });
    const rawText = await response.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {};
    }
    if (!response.ok) {
      throw new Error(
        inferApiFailureMessage(data, {
          status: response.status,
          statusText: response.statusText,
          rawText,
        }) || 'Image upload failed'
      );
    }
    return data;
  },

  lectures: (token) => http.get('/admin/lectures', { token }),
  createLecture: (token, payload) => http.post('/admin/lectures', payload, { token }),
  updateLecture: (token, lectureId, payload) =>
    http.put(`/admin/lectures/${lectureId}`, payload, { token }),
  deleteLecture: (token, lectureId) =>
    http.delete(`/admin/lectures/${lectureId}`, { token }),

  tests: (token) => http.get('/admin/tests', { token }),
  createTest: (token, payload) => http.post('/admin/tests', payload, { token }),
  updateTest: (token, testId, payload) => http.put(`/admin/tests/${testId}`, payload, { token }),
  deleteTest: (token, testId) => http.delete(`/admin/tests/${testId}`, { token }),
  publishTest: (token, testId) => http.put(`/admin/tests/${testId}/publish`, {}, { token }),
  duplicateTest: (token, testId) => http.post(`/admin/tests/${testId}/duplicate`, {}, { token }),

  testQuestions: (token, testId) => http.get(`/admin/tests/${testId}/questions`, { token }),
  createTestQuestion: (token, testId, payload) =>
    http.post(`/admin/tests/${testId}/questions`, payload, { token }),
  previewAikenImport: (token, testId, content) =>
    http.post(`/admin/tests/${testId}/questions/import/preview`, { content }, { token }),
  previewImportFile: async (token, testId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${getApiBaseUrl()}/admin/tests/${testId}/questions/import/preview-file`, {
      method: 'POST',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const rawText = await response.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {};
    }
    if (!response.ok)
      throw new Error(
        inferApiFailureMessage(data, {
          status: response.status,
          statusText: response.statusText,
          rawText,
        }) || 'File import preview failed'
      );
    return data;
  },
  confirmAikenImport: (token, testId, items) =>
    http.post(`/admin/tests/${testId}/questions/import/confirm`, { items }, { token }),
  updateTestQuestion: (token, testId, questionId, payload) =>
    http.put(`/admin/tests/${testId}/questions/${questionId}`, payload, { token }),
  deleteTestQuestion: (token, testId, questionId) =>
    http.delete(`/admin/tests/${testId}/questions/${questionId}`, { token }),

  studentQuestions: (token, subject = 'all') =>
    http.get(`/admin/student-questions?subject=${encodeURIComponent(subject)}`, { token }),
  answerStudentQuestion: (token, questionId, payload) =>
    http.put(`/admin/student-questions/${questionId}`, payload, { token }),
  deleteStudentQuestion: (token, questionId) =>
    http.delete(`/admin/student-questions/${questionId}`, { token }),
  remarks: (token) => http.get('/admin/remarks', { token }),
  markRemarkRead: (token, remarkId) => http.put(`/admin/remarks/${remarkId}/read`, {}, { token }),
  enrollments: (token, query = {}) => {
    const sp = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const s = String(value).trim();
      if (s === '') return;
      sp.set(key, s);
    });
    const qs = sp.toString();
    return http.get(`/enrollments/admin${qs ? `?${qs}` : ''}`, { token, authScope: 'admin' });
  },
  updateEnrollmentStatus: (token, enrollmentId, payload) =>
    http.put(`/enrollments/admin/${enrollmentId}/status`, payload, { token, authScope: 'admin' }),
  exportTestResults: async (token, testId) => {
    const response = await fetch(`${getApiBaseUrl()}/admin/tests/${testId}/results/export`, {
      method: 'GET',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      const rawText = await response.text();
      let data = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = {};
      }
      throw new Error(
        inferApiFailureMessage(data, {
          status: response.status,
          statusText: response.statusText,
          rawText,
        }) || 'Failed to export results'
      );
    }
    const blob = await response.blob();
    const header = response.headers.get('content-disposition') || '';
    const match = header.match(/filename="([^"]+)"/i);
    return { blob, filename: match?.[1] || 'test-results.xlsx' };
  },
};

export const testsApi = {
  getPublicTestMeta: (slug) =>
    http.get(`/tests/${slug}`, {
      token: null,
      retryOnUnauthorized: false,
      authScope: null,
    }),
  verifyCode: (slug, payload, studentToken) =>
    http.post(`/tests/${slug}/verify-code`, payload, {
      authScope: null,
      token: null,
      headers: { Authorization: `Bearer ${studentToken}` },
    }),
  getStartData: (slug, attemptId, attemptToken) =>
    http.get(`/tests/${slug}/attempts/${attemptId}/start`, {
      authScope: null,
      token: null,
      headers: { Authorization: `Bearer ${attemptToken}` },
    }),
  saveAnswer: (slug, attemptId, attemptToken, payload) =>
    http.patch(`/tests/${slug}/attempts/${attemptId}/answers`, payload, {
      authScope: null,
      token: null,
      headers: { Authorization: `Bearer ${attemptToken}` },
    }),
  submitAttempt: (slug, attemptId, attemptToken) =>
    http.post(`/tests/${slug}/attempts/${attemptId}/submit`, {}, {
      authScope: null,
      token: null,
      headers: { Authorization: `Bearer ${attemptToken}` },
    }),
  getResult: (slug, attemptId, attemptToken) =>
    http.get(`/tests/${slug}/attempts/${attemptId}/result`, {
      authScope: null,
      token: null,
      headers: { Authorization: `Bearer ${attemptToken}` },
    }),
};
