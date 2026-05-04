import { clearStudentAuth, getStudentToken } from '../auth/session';
import { AuthRefreshError, isRefreshAuthRevokedError, refreshStudentAccessToken } from './authRefresh.js';
import { createHttpError } from './apiErrors.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const REFRESH_PATH = '/auth/refresh';

function redirectStudentToLogin() {
  if (typeof window === 'undefined') return;
  const p = window.location.pathname;
  if (p.startsWith('/login') || p.startsWith('/register')) return;
  if (p.startsWith('/dashboard') || /^\/tests\/[^/]+\/(start|result)$/.test(p)) {
    window.location.href = '/login';
  }
}

async function studentRequest(path, { method = 'GET', body, token, headers = {}, retryOnUnauthorized = true } = {}) {
  const authToken = token ?? getStudentToken();
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && retryOnUnauthorized && path !== REFRESH_PATH) {
        try {
          const refreshedToken = await refreshStudentAccessToken();
          return studentRequest(path, {
            method,
            body,
            headers,
            token: refreshedToken,
            retryOnUnauthorized: false,
          });
        } catch (e) {
          if (e instanceof AuthRefreshError && e.isNetworkError) {
            throw new Error(
              'Cannot connect to API server. Please ensure backend is running on http://localhost:4000.',
            );
          }
          if (isRefreshAuthRevokedError(e)) {
            clearStudentAuth();
            redirectStudentToLogin();
            throw createHttpError('Session expired', { status: 401, refreshAlreadyTried: true });
          }
          throw createHttpError(e.message || 'Refresh failed', { status: e.status ?? 503 });
        }
      }
      if (response.status === 401) {
        throw createHttpError(data.message || 'Unauthorized', { status: 401, refreshAlreadyTried: true });
      }
      throw createHttpError(data.message || 'Request failed', { status: response.status });
    }
    return data;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Cannot connect to API server. Please ensure backend is running on http://localhost:4000.');
    }
    throw error;
  }
}

async function studentUploadRequest(path, formData, { retryOnUnauthorized = true, token } = {}) {
  const authToken = token ?? getStudentToken();
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && retryOnUnauthorized && path !== REFRESH_PATH) {
        try {
          const refreshedToken = await refreshStudentAccessToken();
          return studentUploadRequest(path, formData, {
            token: refreshedToken,
            retryOnUnauthorized: false,
          });
        } catch (e) {
          if (e instanceof AuthRefreshError && e.isNetworkError) {
            throw new Error(
              'Cannot connect to API server. Please ensure backend is running on http://localhost:4000.',
            );
          }
          if (isRefreshAuthRevokedError(e)) {
            clearStudentAuth();
            redirectStudentToLogin();
            throw createHttpError('Session expired', { status: 401, refreshAlreadyTried: true });
          }
          throw createHttpError(e.message || 'Refresh failed', { status: e.status ?? 503 });
        }
      }
      if (response.status === 401) {
        throw createHttpError(data.message || 'Unauthorized', { status: 401, refreshAlreadyTried: true });
      }
      throw createHttpError(data.message || 'Request failed', { status: response.status });
    }
    return data;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Cannot connect to API server. Please ensure backend is running on http://localhost:4000.');
    }
    throw error;
  }
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
  verifyEmail: (payload) =>
    studentRequest('/auth/student/verify-email', { method: 'POST', body: payload, retryOnUnauthorized: false }),
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
};
