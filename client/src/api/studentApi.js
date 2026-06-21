import { request } from './requestClient.js';
import { enrollmentApi } from './enrollmentApi.js';
import { recordingExtensionFromBlobType } from '../utils/qaQuestionValidation.js';

function studentRequest(path, options = {}) {
  return request(path, { ...options, authScope: 'student' });
}

function studentUploadRequest(path, formData, options = {}) {
  return request(path, {
    ...options,
    authScope: 'student',
    method: 'POST',
    body: formData,
    headers: options.headers,
  });
}

export const studentApi = {
  register: (payload) =>
    studentRequest('/auth/student/register', { method: 'POST', body: payload, retryOnUnauthorized: false }),
  login: (payload) =>
    studentRequest('/auth/student/login', { method: 'POST', body: payload, retryOnUnauthorized: false }),
  googleLogin: (payload) =>
    studentRequest('/auth/student/google', { method: 'POST', body: payload, retryOnUnauthorized: false }),
  forgotPassword: (payload) =>
    studentRequest('/auth/student/forgot-password', { method: 'POST', body: payload, retryOnUnauthorized: false }),
  resetPassword: (payload) =>
    studentRequest('/auth/student/reset-password', { method: 'POST', body: payload, retryOnUnauthorized: false }),
  verifyEmail: (token) =>
    studentRequest('/auth/verify-email', { method: 'POST', body: { token }, retryOnUnauthorized: false }),
  resendVerification: (payload) =>
    studentRequest('/auth/resend-verification', { method: 'POST', body: payload, retryOnUnauthorized: false }),
  logout: () => studentRequest('/auth/student/logout', { method: 'POST', retryOnUnauthorized: false }),
  me: () => studentRequest('/auth/student/me', { retryOnUnauthorized: true }),
  studentEnrollmentStatus: () => studentRequest('/student/enrollment-status'),
  dashboard: () => studentRequest('/student/dashboard'),
  myCourse: () => studentRequest('/student/my-course'),
  courseProgress: (courseId) => studentRequest(`/student/progress/${encodeURIComponent(courseId)}`),
  completeLecture: (lectureId) =>
    studentRequest(`/student/lectures/${encodeURIComponent(lectureId)}/complete`, { method: 'POST' }),
  questions: () => studentRequest('/student/questions'),
  questionThreads: (params = {}) => {
    const query = new URLSearchParams();
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    const qs = query.toString();
    return studentRequest(`/student/question-threads${qs ? `?${qs}` : ''}`);
  },
  questionThread: (threadId) => studentRequest(`/student/question-threads/${encodeURIComponent(threadId)}`),
  questionThreadId: (id) => studentRequest(`/student/questions/${id}/thread-id`),
  questionFormContext: () => studentRequest('/student/questions/form-context'),
  questionDetail: (id) => studentRequest(`/student/questions/${id}`),
  createQuestion: (payload, options = {}) =>
    studentRequest('/student/questions', {
      method: 'POST',
      body: payload,
      idempotencyKey: options.idempotencyKey,
    }),
  uploadQuestionImage: (file) => {
    const formData = new FormData();
    formData.append('image', file);
    return studentUploadRequest('/student/questions/attachment', formData);
  },
  uploadQuestionRecording: (blob, durationSec) => {
    const formData = new FormData();
    const ext = recordingExtensionFromBlobType(blob.type);
    formData.append('recording', blob, `recording.${ext}`);
    formData.append('durationSec', String(durationSec));
    return studentUploadRequest('/student/questions/recording', formData, {
      headers: { 'X-MRB-QA-Source': 'recorder' },
    });
  },
  notifications: async () => {
    try {
      return await studentRequest('/student/notifications');
    } catch (error) {
      if (Number(error?.status) === 404) {
        return { data: { notifications: [] } };
      }
      throw error;
    }
  },
  sessions: () => studentRequest('/student/sessions'),
  resultDetail: (attemptId) => studentRequest(`/student/results/${attemptId}`),
  submitEnrollment: (payload, options) => enrollmentApi.create(payload, options),
  enrollmentStatus: () => enrollmentApi.listMine(),
  enrollmentState: (courseId) => enrollmentApi.getState(courseId),
  testHistory: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    if (params.search) query.set('search', params.search);
    if (params.status) query.set('status', params.status);
    if (params.subjectId && params.subjectId !== 'all') query.set('subjectId', String(params.subjectId));
    if (params.dateRange && params.dateRange !== 'all') query.set('dateRange', params.dateRange);
    if (params.submittedDate) query.set('submittedDate', params.submittedDate);
    const qs = query.toString();
    return studentRequest(`/student/test-history${qs ? `?${qs}` : ''}`);
  },
  listTests: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return studentRequest(`/student/tests${qs ? `?${qs}` : ''}`);
  },
};
