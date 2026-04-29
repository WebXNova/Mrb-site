const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

async function request(path, { method = 'GET', body, token, headers = {} } = {}) {
  const requestUrl = `${API_BASE}${path}`;
  const authToken = token || localStorage.getItem('admin_access_token');
  try {
    const response = await fetch(requestUrl, {
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
      if (response.status === 401) {
        localStorage.removeItem('admin_access_token');
        localStorage.removeItem('admin_user');
        if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
          window.location.href = '/admin/login';
        }
      }
      throw new Error(data.message || 'Request failed');
    }
    return data;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Cannot connect to API server. Please ensure backend is running on http://localhost:4000.');
    }
    throw error;
  }
}

export const http = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};
