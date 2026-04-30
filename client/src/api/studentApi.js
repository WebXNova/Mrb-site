const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

function getStudentToken() {
  return localStorage.getItem('student_access_token');
}

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
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}

export const studentApi = {
  register: (payload) => studentRequest('/auth/student/register', { method: 'POST', body: payload }),
  login: (payload) => studentRequest('/auth/student/login', { method: 'POST', body: payload }),
  me: (token) => studentRequest('/auth/student/me', { token }),
  dashboard: () => studentRequest('/student/dashboard'),
  questions: () => studentRequest('/student/questions'),
  notifications: () => studentRequest('/student/notifications'),
  resultDetail: (attemptId) => studentRequest(`/student/results/${attemptId}`),
};
