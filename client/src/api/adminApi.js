import { inferApiFailureMessage } from './apiErrors';
import { adminAuthenticatedDownload } from './adminDownload.js';
import { http } from './http';
import { getApiBaseUrl } from './runtimeConfig';
import { adminApiPath } from '../config/adminPaths';
import { adminListQueryString } from '../admin/utils/adminListFilterQuery.js';
import {
  buildChapterCreatePayload,
  buildChapterUpdatePayload,
} from '../components/admin/chapterFormUtils';

const ap = adminApiPath;

export const adminApi = {
  login: (payload) => http.post(ap('auth/login'), payload, { retryOnUnauthorized: false }),
  logout: () => http.post(ap('auth/logout'), {}, { retryOnUnauthorized: false }),
  logoutAll: () => http.post('/auth/logout-all', {}, { retryOnUnauthorized: false }),
  me: () => http.get(ap('auth/me'), { authScope: 'admin' }),

  dashboard: (token) => http.get(ap('dashboard'), { token }),
  logs: (token) => http.get(ap('logs'), { token }),
  users: (token) => http.get(ap('users'), { token }),
  updateUserStatus: (token, userId, status) =>
    http.put(ap(`users/${userId}/status`), { status }, { token }),

  teachers: (token) => http.get(ap('teachers'), { token }),
  teacher: (token, teacherId) =>
    http.get(ap(`teachers/${encodeURIComponent(String(teacherId))}`), { token }),
  uniqueActiveSubjects: (token) => http.get(ap('subjects/unique-active'), { token }),
  createTeacher: (token, payload, options = {}) =>
    http.post(ap('teachers/create'), payload, {
      token,
      idempotencyKey: options.idempotencyKey,
    }),
  updateTeacher: (token, teacherId, payload) =>
    http.put(ap(`teachers/${encodeURIComponent(String(teacherId))}`), payload, { token }),
  updateTeacherStatus: (token, teacherId, payload) =>
    http.patch(ap(`teachers/${encodeURIComponent(String(teacherId))}/status`), payload, { token }),

  courses: (token) => http.get(ap('courses'), { token }),
  createCourse: (token, payload) => http.post(ap('courses'), payload, { token }),
  createCourseWizard: (token, payload, options = {}) =>
    http.post(ap('courses/wizard'), payload, {
      token,
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
    }),
  loadCourseDraft: (token) => http.get(ap('course-drafts/load'), { token }),
  saveCourseDraft: (token, payload) => http.post(ap('course-drafts/save'), payload, { token }),
  updateCourse: (token, courseId, payload) =>
    http.put(ap(`courses/${courseId}`), payload, { token }),
  coursePricing: (token, courseId) =>
    http.get(ap(`courses/${courseId}/pricing`), { token }),
  updateCoursePricing: (token, courseId, payload) =>
    http.put(ap(`courses/${courseId}/pricing`), payload, { token }),
  deleteCourse: (token, courseId, { purge = false, forceCascade = false } = {}) => {
    const sp = new URLSearchParams();
    if (purge) sp.set('purge', 'true');
    if (forceCascade) sp.set('forceCascade', 'true');
    const qs = sp.toString();
    return http.delete(ap(`courses/${courseId}${qs ? `?${qs}` : ''}`), { token });
  },
  subjects: (token, courseId, { includeInactive = false } = {}) => {
    const qs = includeInactive ? '?includeInactive=true' : '';
    return http.get(ap(`courses/${courseId}/subjects${qs}`), { token });
  },
  subject: (token, courseId, subjectId) =>
    http.get(ap(`courses/${courseId}/subjects/${subjectId}`), { token }),
  createSubject: (token, courseId, payload) =>
    http.post(ap(`courses/${courseId}/subjects`), payload, { token }),
  updateSubject: (token, courseId, subjectId, payload) =>
    http.put(ap(`courses/${courseId}/subjects/${subjectId}`), payload, { token }),
  deleteSubject: (token, courseId, subjectId) =>
    http.delete(ap(`courses/${courseId}/subjects/${subjectId}`), { token }),
  reorderSubjects: (token, courseId, orderedSubjectIds) =>
    http.put(ap(`courses/${courseId}/subjects/reorder`), { orderedSubjectIds }, { token }),

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
    return http.get(ap(`chapters?${qs}`), { token, signal: options.signal });
  },
  getChapter: (token, id, options = {}) =>
    http.get(ap(`chapters/${encodeURIComponent(String(id))}`), { token, signal: options.signal }),
  createChapter: (token, payload, options = {}) =>
    http.post(ap('chapters'), buildChapterCreatePayload(payload), {
      token,
      signal: options.signal,
    }),
  updateChapter: (token, id, payload, options = {}) =>
    http.put(ap(`chapters/${encodeURIComponent(String(id))}`), buildChapterUpdatePayload(payload), {
      token,
      signal: options.signal,
    }),
  archiveChapter: (token, id, options = {}) =>
    http.delete(ap(`chapters/${encodeURIComponent(String(id))}`), { token, signal: options.signal }),
  /** @deprecated Prefer listChapters */
  chapters: (token, subjectId, options = {}) => {
    const sp = new URLSearchParams();
    sp.set('subjectId', String(subjectId));
    return http.get(ap(`chapters?${sp}`), { token, signal: options?.signal });
  },

  courseBatches: (token, courseId) => http.get(ap(`courses/${courseId}/batches`), { token }),
  createCourseBatch: (token, courseId, payload) =>
    http.post(ap(`courses/${courseId}/batches`), payload, { token }),
  updateCourseBatch: (token, batchId, payload) =>
    http.put(ap(`batches/${batchId}`), payload, { token }),
  archiveCourseBatch: (token, batchId) =>
    http.post(ap(`batches/${batchId}/archive`), {}, { token }),
  reactivateCourseBatch: (token, batchId) =>
    http.post(ap(`batches/${batchId}/reactivate`), {}, { token }),
  uploadCourseImage: async (_token, file) => {
    const formData = new FormData();
    formData.append('image', file);
    return http.post(ap('courses/upload-image'), formData, { authScope: 'admin' });
  },

  uploadQuestionBankImage: async (_token, file) => {
    const formData = new FormData();
    formData.append('image', file);
    return http.post(ap('questions/upload-image'), formData, { authScope: 'admin' });
  },

  /**
   * List admin lectures with optional server-side filters.
   * @param {Record<string, string | number>} [filters]
   */
  listLectures: (token, filters = {}, options = {}) => {
    const qs = adminListQueryString(filters);
    return http.get(ap(`lectures${qs}`), { token, signal: options.signal });
  },

  /** Authoritative lecture by id (server filtered). */
  getLecture: async (token, id, options = {}) => {
    const res = await http.get(ap(`lectures?lecture_id=${encodeURIComponent(String(id))}&limit=1`), {
      token,
      signal: options.signal,
    });
    const payload = res?.data;
    const list = Array.isArray(payload) ? payload : payload?.items ?? [];
    const found = list[0];
    if (!found) {
      const err = new Error('Lecture not found');
      err.status = 404;
      throw err;
    }
    return { data: found };
  },

  createLecture: (token, payload, options = {}) =>
    http.post(ap('lectures'), payload, { token, signal: options.signal }),
  updateLecture: (token, lectureId, payload, options = {}) =>
    http.put(ap(`lectures/${encodeURIComponent(String(lectureId))}`), payload, {
      token,
      signal: options.signal,
    }),
  deleteLecture: (token, lectureId, options = {}) =>
    http.delete(ap(`lectures/${encodeURIComponent(String(lectureId))}`), {
      token,
      signal: options.signal,
    }),

  /** @deprecated Prefer listLectures */
  lectures: (token, options = {}) => http.get(ap('lectures'), { token, signal: options?.signal }),

  tests: (token, filters = {}) => {
    const qs = adminListQueryString(filters);
    return http.get(ap(`tests${qs}`), { token });
  },
  getTest: (token, testId) => http.get(ap(`tests/${testId}`), { token }),
  getTestCreateOptions: (token) => http.get(ap('tests/create-options'), { token }),
  createTest: (token, payload) =>
    http.post(ap('tests'), payload, { token }),
  patchTestBasicInfo: (token, testId, payload) =>
    http.patch(ap(`tests/${testId}/basic-info`), payload, { token }),
  getTestRules: (token, testId) => http.get(ap(`tests/${testId}/rules`), { token }),
  patchTestRules: (token, testId, payload) =>
    http.patch(ap(`tests/${testId}/rules`), payload, { token }),
  getTestSettings: (token, testId) => http.get(ap(`tests/${testId}/settings`), { token }),
  patchTestSettings: (token, testId, payload) =>
    http.patch(ap(`tests/${testId}/settings`), payload, { token }),
  getTestCompleteness: (token, testId) => http.get(ap(`tests/${testId}/completeness`), { token }),
  getTestResultsAnalytics: (token, testId) =>
    http.get(ap(`tests/${testId}/results/analytics`), { token }),
  deleteTest: (token, testId) => http.delete(ap(`tests/${testId}`), { token }),
  publishTest: (token, testId) => http.post(ap(`tests/${testId}/publish`), {}, { token }),
  duplicateTest: (token, testId) => http.post(ap(`tests/${testId}/duplicate`), {}, { token }),

  testQuestions: (token, testId) => http.get(ap(`tests/${testId}/questions`), { token }),

  getQuizDraft: (token, testId, options = {}) =>
    http.get(ap(`tests/${encodeURIComponent(String(testId))}/quiz-draft`), {
      token,
      signal: options.signal,
    }),

  putQuizDraft: (token, testId, body, options = {}) =>
    http.put(ap(`tests/${encodeURIComponent(String(testId))}/quiz-draft`), body, {
      token,
      signal: options.signal,
    }),

  deleteQuizDraft: (token, testId, options = {}) =>
    http.delete(ap(`tests/${encodeURIComponent(String(testId))}/quiz-draft`), {
      token,
      signal: options.signal,
    }),

  importAikenQuestions: (token, payload) =>
    http.post(ap('questions/import/aiken'), payload, { token }),

  listQuestions: (token, filters = {}, options = {}) => {
    const sp = new URLSearchParams();
    if (filters.page != null) sp.set('page', String(filters.page));
    if (filters.limit != null) sp.set('limit', String(filters.limit));
    if (filters.search) sp.set('search', String(filters.search).trim());
    if (filters.topic) sp.set('topic', String(filters.topic).trim());
    if (filters.course_id != null && filters.course_id !== '') sp.set('course_id', String(filters.course_id));
    if (filters.subject_id != null && filters.subject_id !== '') sp.set('subject_id', String(filters.subject_id));
    if (filters.difficulty) sp.set('difficulty', String(filters.difficulty));
    const qs = sp.toString();
    return http.get(ap(`questions${qs ? `?${qs}` : ''}`), { token, signal: options.signal });
  },

  bulkDeleteQuestions: (token, questionIds) =>
    http.post(ap('questions/bulk/delete'), { question_ids: questionIds }, { token }),

  bulkExportQuestions: (token, questionIds, format = 'aiken') =>
    http.post(ap('questions/bulk/export'), { question_ids: questionIds, format }, { token }),

  bulkAssignQuestionsToTest: (token, questionIds, testId) =>
    http.post(ap('questions/bulk/assign-test'), { question_ids: questionIds, test_id: testId }, { token }),

  previewAikenImport: (token, payload) =>
    http.post(ap('questions/import/aiken/preview'), payload, { token }),

  getAikenImportBatch: (token, batchId) =>
    http.get(ap(`questions/import/aiken/batches/${encodeURIComponent(String(batchId))}`), { token }),

  studentQuestions: (token, subject = 'all') =>
    http.get(ap(`student-questions?subject=${encodeURIComponent(subject)}`), { token }),
  answerStudentQuestion: (token, questionId, payload) =>
    http.put(ap(`student-questions/${questionId}`), payload, { token }),
  deleteStudentQuestion: (token, questionId) =>
    http.delete(ap(`student-questions/${questionId}`), { token }),

  qaMonitoringStats: (token, query = {}) => {
    const sp = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const s = String(value).trim();
      if (s === '') return;
      sp.set(key, s);
    });
    const qs = sp.toString();
    return http.get(ap(`qa-monitoring/statistics${qs ? `?${qs}` : ''}`), { token });
  },
  qaMonitoringQuestions: (token, query = {}) => {
    const sp = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const s = String(value).trim();
      if (s === '') return;
      sp.set(key, s);
    });
    const qs = sp.toString();
    return http.get(ap(`qa-monitoring/questions${qs ? `?${qs}` : ''}`), { token });
  },
  qaMonitoringQuestionDetail: (token, questionId) =>
    http.get(ap(`qa-monitoring/questions/${encodeURIComponent(String(questionId))}`), { token }),
  qaMonitoringAnswers: (token, query = {}) => {
    const sp = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const s = String(value).trim();
      if (s === '') return;
      sp.set(key, s);
    });
    const qs = sp.toString();
    return http.get(ap(`qa-monitoring/answers${qs ? `?${qs}` : ''}`), { token });
  },
  qaMonitoringActivity: (token, query = {}) => {
    const sp = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const s = String(value).trim();
      if (s === '') return;
      sp.set(key, s);
    });
    const qs = sp.toString();
    return http.get(ap(`qa-monitoring/teacher-activity${qs ? `?${qs}` : ''}`), { token });
  },
  exportQaMonitoring: async (token, query = {}) => {
    const sp = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const s = String(value).trim();
      if (s === '') return;
      sp.set(key, s);
    });
    const qs = sp.toString();
    const response = await fetch(`${getApiBaseUrl()}${ap(`qa-monitoring/export${qs ? `?${qs}` : ''}`)}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Authorization: token ? `Bearer ${token}` : undefined,
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(inferApiFailureMessage(null, { status: response.status, rawText: text }));
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/i);
    return { blob, filename: match?.[1] || 'qa-monitoring-export.csv' };
  },

  teacherInsightsDashboard: (token, query = {}) => {
    const sp = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const s = String(value).trim();
      if (s === '') return;
      sp.set(key, s);
    });
    const qs = sp.toString();
    return http.get(ap(`teacher-insights/dashboard${qs ? `?${qs}` : ''}`), { token });
  },
  teacherInsightsActivityFeed: (token, query = {}) => {
    const sp = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const s = String(value).trim();
      if (s === '') return;
      sp.set(key, s);
    });
    const qs = sp.toString();
    return http.get(ap(`teacher-insights/activity-feed${qs ? `?${qs}` : ''}`), { token });
  },
  teacherInsightsDetail: (token, teacherId) =>
    http.get(ap(`teacher-insights/teachers/${encodeURIComponent(String(teacherId))}`), { token }),

  remarks: (token) => http.get(ap('remarks'), { token }),
  markRemarkRead: (token, remarkId) => http.put(ap(`remarks/${remarkId}/read`), {}, { token }),
  postRemark: (token, remarkId) => http.post(ap(`remarks/${remarkId}/post`), {}, { token }),
  unpostRemark: (token, remarkId) => http.post(ap(`remarks/${remarkId}/unpost`), {}, { token }),

  enrollments: (token, query = {}) => {
    const sp = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const s = String(value).trim();
      if (s === '') return;
      sp.set(key, s);
    });
    const qs = sp.toString();
    return http.get(ap(`enrollments${qs ? `?${qs}` : ''}`), { token, authScope: 'admin' });
  },
  enrollmentsSummary: (token) =>
    http.get(ap('enrollments/summary'), { token, authScope: 'admin' }),
  updateEnrollmentStatus: (token, enrollmentId, payload) =>
    http.put(ap(`enrollments/${enrollmentId}/status`), payload, { token, authScope: 'admin' }),
  suspendEnrollmentStudent: (token, enrollmentId, payload) =>
    http.post(ap(`enrollments/${enrollmentId}/suspend-student`), payload, {
      token,
      authScope: 'admin',
    }),
  exportTestResults: async (_token, testId) => {
    const { blob, filename } = await adminAuthenticatedDownload(`tests/${testId}/results/export`, {
      method: 'GET',
      accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    return { blob, filename: filename || 'test-results.xlsx' };
  },
  /** Export test as CSV with embedded HTML (cookie auth + CSRF). */
  exportTest: async (_token, testId) => {
    const { blob, filename } = await adminAuthenticatedDownload(`tests/${testId}/export`, {
      method: 'POST',
      body: { format: 'csv' },
      accept: 'text/csv',
    });
    return { blob, filename: filename || 'test-export.csv', format: 'csv' };
  },

  validateTestImport: (token, payload) =>
    http.post(ap('tests/import/validate'), payload, { token }),

  previewTestImport: (token, payload) =>
    http.post(ap('tests/import/preview'), payload, { token }),

  confirmTestImport: (token, payload) =>
    http.post(ap('tests/import/confirm'), payload, { token }),

  /** Single-step import alias — POST /tests/import */
  importTest: (token, payload) => http.post(ap('tests/import'), payload, { token }),

  getTestTransferDashboard: (token) => http.get(ap('tests/transfer/dashboard'), { token }),

  listTestExportHistory: (token, params = {}) => {
    const sp = new URLSearchParams();
    if (params.limit != null) sp.set('limit', String(params.limit));
    if (params.offset != null) sp.set('offset', String(params.offset));
    if (params.test_id != null) sp.set('test_id', String(params.test_id));
    if (params.status) sp.set('status', String(params.status));
    const qs = sp.toString();
    return http.get(ap(`tests/transfer/export-history${qs ? `?${qs}` : ''}`), { token });
  },

  getTestExportHistoryBatch: (token, batchId) =>
    http.get(ap(`tests/transfer/export-history/${encodeURIComponent(String(batchId))}`), { token }),

  listTestImportHistory: (token, params = {}) => {
    const sp = new URLSearchParams();
    if (params.limit != null) sp.set('limit', String(params.limit));
    if (params.offset != null) sp.set('offset', String(params.offset));
    if (params.course_id != null) sp.set('course_id', String(params.course_id));
    if (params.status) sp.set('status', String(params.status));
    const qs = sp.toString();
    return http.get(ap(`tests/transfer/import-history${qs ? `?${qs}` : ''}`), { token });
  },

  getTestImportHistoryBatch: (token, batchId) =>
    http.get(ap(`tests/transfer/import-history/${encodeURIComponent(String(batchId))}`), { token }),

  getTestTransferLogs: (token, params = {}) => {
    const sp = new URLSearchParams();
    if (params.limit != null) sp.set('limit', String(params.limit));
    const qs = sp.toString();
    return http.get(ap(`tests/transfer/logs${qs ? `?${qs}` : ''}`), { token });
  },
};

export const testsApi = {
  getPublicTestMeta: (slug) =>
    http.get(`/courses/public/tests/${slug}`, {
      token: null,
      retryOnUnauthorized: false,
      authScope: null,
    }),
  getTestPrep: (slug) =>
    http.get(`/tests/${slug}/prep`, {
      authScope: 'student',
      retryOnUnauthorized: true,
    }),
  verifyCode: (slug, payload) =>
    http.post(`/tests/${slug}/verify-code`, payload, {
      authScope: 'student',
      retryOnUnauthorized: true,
    }),
  getStartData: (slug, attemptId) =>
    http.get(`/tests/${slug}/attempts/${attemptId}/start`, {
      authScope: 'student',
      retryOnUnauthorized: true,
    }),
  saveAnswer: (slug, attemptId, payload) =>
    http.patch(`/tests/${slug}/attempts/${attemptId}/answers`, payload, {
      authScope: 'student',
      retryOnUnauthorized: true,
    }),
  submitAttempt: (slug, attemptId) =>
    http.post(`/tests/${slug}/attempts/${attemptId}/submit`, {}, {
      authScope: 'student',
      retryOnUnauthorized: true,
    }),
  getResult: (slug, attemptId) =>
    http.get(`/tests/${slug}/attempts/${attemptId}/result`, {
      authScope: 'student',
      retryOnUnauthorized: true,
    }),
};

/**
 * @deprecated LEGACY runtime — disabled server-side (410). Use studentApi.resultDetail
 * (GET /api/student/results/:attemptId) or testsApi.getResult for slug flow.
 */
export const resultApi = {
  /** @deprecated See studentApi.resultDetail */
  fetchByAttemptId: (attemptId) =>
    http.get(`/attempts/${attemptId}/result`, {
      authScope: 'student',
      retryOnUnauthorized: true,
    }),
};
