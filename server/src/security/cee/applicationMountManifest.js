/**
 * Canonical Express API mount points — must stay in sync with app.js `app.use` mounts.
 * Used by startup grid validation (mount ↔ namespace ↔ grid rule).
 */

/** @typedef {Readonly<{ mountPath: string, isProtectedNamespace: boolean, namespace: string|null }>} ApiMountEntry */

/** @type {ReadonlyArray<ApiMountEntry>} */
export const APPLICATION_API_MOUNTS = Object.freeze([
  Object.freeze({ mountPath: '/api/payments', isProtectedNamespace: false, namespace: null }),
  Object.freeze({ mountPath: '/api/uploads', isProtectedNamespace: true, namespace: '/api/uploads' }),
  Object.freeze({ mountPath: '/api/auth', isProtectedNamespace: false, namespace: null }),
  Object.freeze({ mountPath: '/api/admin', isProtectedNamespace: false, namespace: null }),
  Object.freeze({ mountPath: '/api/tests', isProtectedNamespace: true, namespace: '/api/tests' }),
  Object.freeze({ mountPath: '/api/student', isProtectedNamespace: true, namespace: '/api/student' }),
  Object.freeze({ mountPath: '/api/email', isProtectedNamespace: false, namespace: null }),
  Object.freeze({ mountPath: '/api/contact', isProtectedNamespace: false, namespace: null }),
  Object.freeze({ mountPath: '/api/enrollments', isProtectedNamespace: false, namespace: null }),
  Object.freeze({ mountPath: '/api/courses', isProtectedNamespace: false, namespace: null }),
  Object.freeze({ mountPath: '/api/locations', isProtectedNamespace: false, namespace: null }),
  Object.freeze({ mountPath: '/api/questions', isProtectedNamespace: false, namespace: null }),
]);

/** Inline routes registered directly on app (not router mounts). */
export const APPLICATION_INLINE_ROUTES = Object.freeze([
  '/api/health',
  '/api/ready',
]);
