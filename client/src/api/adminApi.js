import { http } from './http';
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

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

  courses: (token) => http.get('/admin/courses', { token }),
  createCourse: (token, payload) => http.post('/admin/courses', payload, { token }),
  updateCourse: (token, courseId, payload) =>
    http.put(`/admin/courses/${courseId}`, payload, { token }),
  deleteCourse: (token, courseId) => http.delete(`/admin/courses/${courseId}`, { token }),

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
    const response = await fetch(`${API_BASE}/admin/tests/${testId}/questions/import/preview-file`, {
      method: 'POST',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'File import preview failed');
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
  enrollments: (token) => http.get('/enrollments/admin', { token, authScope: 'admin' }),
  updateEnrollmentStatus: (token, enrollmentId, payload) =>
    http.put(`/enrollments/admin/${enrollmentId}/status`, payload, { token, authScope: 'admin' }),
  exportTestResults: async (token, testId) => {
    const response = await fetch(`${API_BASE}/admin/tests/${testId}/results/export`, {
      method: 'GET',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error('Failed to export results');
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
