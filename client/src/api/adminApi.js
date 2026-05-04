import { http } from './http';

export const adminApi = {
  login: (payload) => http.post('/auth/login', payload, { retryOnUnauthorized: false }),
  logout: () => http.post('/auth/logout', {}, { retryOnUnauthorized: false }),
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
  regenerateTestCode: (token, testId) => http.put(`/admin/tests/${testId}/regenerate-code`, {}, { token }),

  testQuestions: (token, testId) => http.get(`/admin/tests/${testId}/questions`, { token }),
  createTestQuestion: (token, testId, payload) =>
    http.post(`/admin/tests/${testId}/questions`, payload, { token }),
  previewAikenImport: (token, testId, content) =>
    http.post(`/admin/tests/${testId}/questions/import/preview`, { content }, { token }),
  confirmAikenImport: (token, testId, items) =>
    http.post(`/admin/tests/${testId}/questions/import/confirm`, { items }, { token }),
  updateTestQuestion: (token, testId, questionId, payload) =>
    http.put(`/admin/tests/${testId}/questions/${questionId}`, payload, { token }),
  deleteTestQuestion: (token, testId, questionId) =>
    http.delete(`/admin/tests/${testId}/questions/${questionId}`, { token }),

  mrbCodes: (token) => http.get('/admin/mrb-codes', { token }),
  generateMrbCodes: (token, payload) => http.post('/admin/mrb-codes', payload, { token }),
  deleteMrbCode: (token, codeId) => http.delete(`/admin/mrb-codes/${codeId}`, { token }),

  studentQuestions: (token, subject = 'all') =>
    http.get(`/admin/student-questions?subject=${encodeURIComponent(subject)}`, { token }),
  answerStudentQuestion: (token, questionId, payload) =>
    http.put(`/admin/student-questions/${questionId}`, payload, { token }),
  deleteStudentQuestion: (token, questionId) =>
    http.delete(`/admin/student-questions/${questionId}`, { token }),
};

export const testsApi = {
  verifyCode: (slug, payload, studentToken) =>
    http.post(`/tests/${slug}/verify-code`, payload, {
      token: null,
      headers: { Authorization: `Bearer ${studentToken}` },
    }),
  getStartData: (slug, attemptId, attemptToken) =>
    http.get(`/tests/${slug}/attempts/${attemptId}/start`, {
      token: null,
      headers: { Authorization: `Bearer ${attemptToken}` },
    }),
  saveAnswer: (slug, attemptId, attemptToken, payload) =>
    http.patch(`/tests/${slug}/attempts/${attemptId}/answers`, payload, {
      token: null,
      headers: { Authorization: `Bearer ${attemptToken}` },
    }),
  submitAttempt: (slug, attemptId, attemptToken) =>
    http.post(`/tests/${slug}/attempts/${attemptId}/submit`, {}, {
      token: null,
      headers: { Authorization: `Bearer ${attemptToken}` },
    }),
  getResult: (slug, attemptId, attemptToken) =>
    http.get(`/tests/${slug}/attempts/${attemptId}/result`, {
      token: null,
      headers: { Authorization: `Bearer ${attemptToken}` },
    }),
};
