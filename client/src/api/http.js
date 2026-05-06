import { request } from './requestClient.js';

export const http = {
  get: (path, options) => request(path, { ...options, method: 'GET', authScope: options?.authScope || 'admin' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body, authScope: options?.authScope || 'admin' }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body, authScope: options?.authScope || 'admin' }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body, authScope: options?.authScope || 'admin' }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE', authScope: options?.authScope || 'admin' }),
};
