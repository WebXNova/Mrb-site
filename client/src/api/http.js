import { request } from './requestClient.js';

/** Treat explicit `authScope: null` as unauthenticated (avoid coercing to admin refresh). */
function resolveAuthScope(options) {
  if (options != null && Object.prototype.hasOwnProperty.call(options, 'authScope')) {
    return options.authScope;
  }
  return 'admin';
}

export const http = {
  get: (path, options = {}) => request(path, { ...options, method: 'GET', authScope: resolveAuthScope(options) }),
  post: (path, body, options = {}) =>
    request(path, { ...options, method: 'POST', body, authScope: resolveAuthScope(options) }),
  put: (path, body, options = {}) =>
    request(path, { ...options, method: 'PUT', body, authScope: resolveAuthScope(options) }),
  patch: (path, body, options = {}) =>
    request(path, { ...options, method: 'PATCH', body, authScope: resolveAuthScope(options) }),
  delete: (path, options = {}) => request(path, { ...options, method: 'DELETE', authScope: resolveAuthScope(options) }),
};
