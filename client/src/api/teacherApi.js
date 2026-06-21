import { request } from './requestClient.js';
import { recordingExtensionFromBlobType } from '../utils/qaQuestionValidation.js';

function teacherRequest(path, options = {}) {
  return request(path, { ...options, authScope: 'teacher' });
}

function teacherUploadRequest(path, formData, options = {}) {
  return request(path, {
    ...options,
    authScope: 'teacher',
    method: 'POST',
    body: formData,
    headers: options.headers,
  });
}

export const teacherApi = {
  login: (payload) =>
    teacherRequest('/auth/teacher/login', { method: 'POST', body: payload, retryOnUnauthorized: false }),
  logout: () => teacherRequest('/auth/teacher/logout', { method: 'POST', retryOnUnauthorized: false }),
  me: () => teacherRequest('/auth/teacher/me', { retryOnUnauthorized: true }),
  profile: () => teacherRequest('/teacher/me'),
  questionThreads: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    if (params.pinned_only) query.set('pinned_only', 'true');
    const qs = query.toString();
    return teacherRequest(`/teacher/question-threads${qs ? `?${qs}` : ''}`);
  },
  questionThread: (threadId) => teacherRequest(`/teacher/question-threads/${encodeURIComponent(threadId)}`),
  sendThreadMessage: (threadId, payload, options = {}) =>
    teacherRequest(`/teacher/question-threads/${encodeURIComponent(threadId)}/messages`, {
      method: 'POST',
      body: payload,
      idempotencyKey: options.idempotencyKey,
    }),
  questionThreadId: (questionId) => teacherRequest(`/teacher/questions/${questionId}/thread-id`),
  questions: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    if (params.pinned_only) query.set('pinned_only', 'true');
    const qs = query.toString();
    return teacherRequest(`/teacher/questions${qs ? `?${qs}` : ''}`);
  },
  questionDetail: (questionId) => teacherRequest(`/teacher/questions/${questionId}`),
  questionStudentContext: (questionId) => teacherRequest(`/teacher/questions/${questionId}/student-context`),
  pinQuestion: (questionId, pinned) =>
    teacherRequest(`/teacher/questions/${questionId}/pin`, {
      method: 'PATCH',
      body: { pinned },
    }),
  submitAnswer: (questionId, payload, options = {}) =>
    teacherRequest(`/teacher/questions/${questionId}/answer`, {
      method: 'POST',
      body: payload,
      idempotencyKey: options.idempotencyKey,
    }),
  updateAnswer: (questionId, payload) =>
    teacherRequest(`/teacher/questions/${questionId}/answer`, {
      method: 'PATCH',
      body: payload,
    }),
  uploadAnswerImage: (file) => {
    const formData = new FormData();
    formData.append('image', file);
    return teacherUploadRequest('/teacher/questions/answer/attachment', formData);
  },
  uploadAnswerRecording: (blob, durationSec) => {
    const formData = new FormData();
    const ext = recordingExtensionFromBlobType(blob.type);
    formData.append('recording', blob, `recording.${ext}`);
    formData.append('durationSec', String(durationSec));
    return teacherUploadRequest('/teacher/questions/answer/recording', formData, {
      headers: { 'X-MRB-QA-Source': 'recorder' },
    });
  },
};
