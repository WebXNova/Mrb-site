import { inferApiFailureMessage } from './apiErrors';
import { http } from './http';
import { getApiBaseUrl } from './runtimeConfig';
import {
  buildChapterCreatePayload,
  buildChapterUpdatePayload,
} from '../components/admin/chapterFormUtils';

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

  listChapters: (token, filters = {}, options = {}) => {
    const sp = new URLSearchParams();
    if (filters.subjectId != null && String(filters.subjectId).trim() !== '') {
      sp.set('subjectId', String(filters.subjectId).trim());
    }
    const statusRaw = filters.status;
    const statusNorm =
      statusRaw === 'archived' || statusRaw === 'all'
        ? statusRaw
        : 'active';
    sp.set('status', statusNorm);
    const qs = sp.toString();
    return http.get(`/admin/chapters?${qs}`, { token, signal: options.signal });
  },
  getChapter: (token, id, options = {}) =>
    http.get(`/admin/chapters/${encodeURIComponent(String(id))}`, { token, signal: options.signal }),
  createChapter: (token, payload, options = {}) =>
    http.post('/admin/chapters', buildChapterCreatePayload(payload), {
      token,
      signal: options.signal,
    }),
  updateChapter: (token, id, payload, options = {}) =>
    http.put(`/admin/chapters/${encodeURIComponent(String(id))}`, buildChapterUpdatePayload(payload), {
      token,
      signal: options.signal,
    }),
  archiveChapter: (token, id, options = {}) =>
    http.delete(`/admin/chapters/${encodeURIComponent(String(id))}`, { token, signal: options.signal }),
  /** @deprecated Prefer listChapters */
  chapters: (token, subjectId, options = {}) => {
    const sp = new URLSearchParams();
    sp.set('subjectId', String(subjectId));
    return http.get(`/admin/chapters?${sp}`, { token, signal: options?.signal });
  },

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

  uploadQuestionBankImage: async (_token, file) => {
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
    const response = await fetch(`${getApiBaseUrl()}/admin/questions/upload-image`, {
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
        }) || 'Question image upload failed'
      );
    }
    return data;
  },

  /**
   * List admin lectures. Server currently ignores query filters; callers may filter locally.
   * @param {Record<string, string | number>} [filters]
   */
  listLectures: (token, filters = {}, options = {}) => {
    const sp = new URLSearchParams();
    Object.entries(filters || {}).forEach(([k, v]) => {
      if (v != null && String(v).trim() !== '') sp.set(k, String(v).trim());
    });
    const qs = sp.toString();
    return http.get(`/admin/lectures${qs ? `?${qs}` : ''}`, { token, signal: options.signal });
  },

  /** Authoritative lecture by id. Uses list endpoint until a dedicated GET route exists. */
  getLecture: async (token, id, options = {}) => {
    const res = await http.get('/admin/lectures', { token, signal: options.signal });
    const list = res?.data ?? [];
    const nid = Number(id);
    const found = list.find((l) => Number(l.id) === nid);
    if (!found) {
      const err = new Error('Lecture not found');
      err.status = 404;
      throw err;
    }
    return { data: found };
  },

  createLecture: (token, payload, options = {}) =>
    http.post('/admin/lectures', payload, { token, signal: options.signal }),
  updateLecture: (token, lectureId, payload, options = {}) =>
    http.put(`/admin/lectures/${encodeURIComponent(String(lectureId))}`, payload, {
      token,
      signal: options.signal,
    }),
  deleteLecture: (token, lectureId, options = {}) =>
    http.delete(`/admin/lectures/${encodeURIComponent(String(lectureId))}`, {
      token,
      signal: options.signal,
    }),

  /** @deprecated Prefer listLectures */
  lectures: (token, options = {}) => http.get('/admin/lectures', { token, signal: options?.signal }),

  tests: (token) => http.get('/admin/tests', { token }),
  getTest: (token, testId) => http.get(`/admin/tests/${testId}`, { token }),
  getTestCreateOptions: (token) => http.get('/admin/tests/create-options', { token }),
  createTest: (token, payload) =>
    http.post('/admin/tests', payload, { token }),
  patchTestBasicInfo: (token, testId, payload) =>
    http.patch(`/admin/tests/${testId}/basic-info`, payload, { token }),
  getTestRules: (token, testId) => http.get(`/admin/tests/${testId}/rules`, { token }),
  patchTestRules: (token, testId, payload) =>
    http.patch(`/admin/tests/${testId}/rules`, payload, { token }),
  getTestSettings: (token, testId) => http.get(`/admin/tests/${testId}/settings`, { token }),
  patchTestSettings: (token, testId, payload) =>
    http.patch(`/admin/tests/${testId}/settings`, payload, { token }),
  getTestCompleteness: (token, testId) => http.get(`/admin/tests/${testId}/completeness`, { token }),
  deleteTest: (token, testId) => http.delete(`/admin/tests/${testId}`, { token }),
  publishTest: (token, testId) => http.post(`/admin/tests/${testId}/publish`, {}, { token }),
  duplicateTest: (token, testId) => http.post(`/admin/tests/${testId}/duplicate`, {}, { token }),

  testQuestions: (token, testId) => http.get(`/admin/tests/${testId}/questions`, { token }),
  availableTestQuestions: (token, testId, query = {}) => {
    const sp = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || String(value).trim() === '') return;
      sp.set(key, String(value).trim());
    });
    const qs = sp.toString();
    return http.get(`/admin/tests/${testId}/questions/available${qs ? `?${qs}` : ''}`, { token });
  },
  linkTestQuestion: (token, testId, payload) =>
    http.post(`/admin/tests/${testId}/questions`, payload, { token }),
  linkTestQuestionsBulk: (token, testId, questionIds) =>
    http.post(`/admin/tests/${testId}/questions`, { question_ids: questionIds }, { token }),
  unlinkTestQuestion: (token, testId, questionId) =>
    http.delete(`/admin/tests/${testId}/questions/${questionId}`, { token }),
  unlinkTestQuestionsBulk: (token, testId, questionIds) =>
    http.delete(`/admin/tests/${testId}/questions`, { token, body: { question_ids: questionIds } }),
  reorderTestQuestions: (token, testId, items) =>
    http.put(`/admin/tests/${testId}/questions/reorder`, items, { token }),

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
    http.get(`/courses/public/tests/${slug}`, {
      token: null,
      retryOnUnauthorized: false,
      authScope: null,
    }),
  getTestPrep: (slug, studentToken) =>
    http.get(`/tests/${slug}/prep`, {
      authScope: null,
      token: null,
      headers: { Authorization: `Bearer ${studentToken}` },
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

export const resultApi = {
  /** Official read-only result — JWT student auth; never grades on the client. */
  fetchByAttemptId: (attemptId) =>
    http.get(`/attempts/${attemptId}/result`, {
      authScope: 'student',
      retryOnUnauthorized: true,
    }),
};
