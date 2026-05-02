import { clearStudentAuth, getStudentToken } from '../auth/session';
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function studentRequest(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token || getStudentToken() ? { Authorization: `Bearer ${token || getStudentToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      clearStudentAuth();
      if (
        typeof window !== 'undefined' &&
        ['/dashboard', '/student'].some((prefix) =>
          window.location.pathname === prefix ||
          window.location.pathname.startsWith(`${prefix}/`)
        )
      ) {
        window.location.href = '/login';
      }
    }
    throw new Error(data.message || 'Request failed');
  }
  return data;
}

export const studentApi = {
  register: (payload) => studentRequest('/auth/student/register', { method: 'POST', body: payload }),
  login: (payload) => studentRequest('/auth/student/login', { method: 'POST', body: payload }),
  forgotPassword: (payload) => studentRequest('/auth/student/forgot-password', { method: 'POST', body: payload }),
  resetPassword: (payload) => studentRequest('/auth/student/reset-password', { method: 'POST', body: payload }),
  verifyEmail: (payload) => studentRequest('/auth/student/verify-email', { method: 'POST', body: payload }),
  me: (token) => studentRequest('/auth/student/me', { token }),
  dashboard: () => studentRequest('/student/dashboard'),
  questions: () => studentRequest('/student/questions'),
  notifications: () => studentRequest('/student/notifications'),
  resultDetail: (attemptId) => studentRequest(`/student/results/${attemptId}`),
};
