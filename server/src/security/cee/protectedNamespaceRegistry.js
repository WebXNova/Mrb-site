/**
 * CEE Protected Namespace Registry — instructional API prefixes that MUST have grid rules.
 *
 * Immutable at runtime. Extend only via code review + startup validator pass.
 */

/** @typedef {'entitlement'|'identity_only'} RequiredGridPolicy */

/**
 * @typedef {Readonly<{
 *   namespace: string,
 *   label: string,
 *   requiredPolicy: RequiredGridPolicy,
 *   mountPaths: ReadonlyArray<string>,
 *   routeModules: ReadonlyArray<string>,
 * }>} ProtectedNamespaceDefinition
 */

/** @type {ReadonlyArray<ProtectedNamespaceDefinition>} */
export const CEE_PROTECTED_NAMESPACES = Object.freeze([
  Object.freeze({
    namespace: '/api/student',
    label: 'student_portal',
    requiredPolicy: 'entitlement',
    mountPaths: Object.freeze(['/api/student']),
    routeModules: Object.freeze(['src/routes/student.routes.js']),
  }),
  Object.freeze({
    namespace: '/api/tests',
    label: 'tests',
    requiredPolicy: 'entitlement',
    mountPaths: Object.freeze(['/api/tests']),
    routeModules: Object.freeze(['src/routes/tests.routes.js']),
  }),
  Object.freeze({
    namespace: '/api/uploads',
    label: 'uploads',
    requiredPolicy: 'entitlement',
    mountPaths: Object.freeze(['/api/uploads']),
    routeModules: Object.freeze(['src/routes/secureMedia.routes.js']),
  }),
  Object.freeze({
    namespace: '/api/results',
    label: 'results',
    requiredPolicy: 'entitlement',
    mountPaths: Object.freeze([]),
    routeModules: Object.freeze([]),
  }),
  Object.freeze({
    namespace: '/api/lectures',
    label: 'lectures',
    requiredPolicy: 'entitlement',
    mountPaths: Object.freeze([]),
    routeModules: Object.freeze([]),
  }),
]);

/** Fast lookup by namespace string */
export const CEE_PROTECTED_NAMESPACE_PREFIXES = Object.freeze(
  CEE_PROTECTED_NAMESPACES.map((d) => d.namespace)
);

/**
 * @param {string} path
 * @returns {ProtectedNamespaceDefinition|null}
 */
export function matchProtectedNamespace(path) {
  const normalized = String(path || '').split('?')[0].replace(/\/+$/, '') || '/';
  for (const def of CEE_PROTECTED_NAMESPACES) {
    const ns = def.namespace;
    if (normalized === ns || normalized.startsWith(`${ns}/`)) {
      return def;
    }
  }
  return null;
}

/**
 * @param {string} namespace
 */
export function getProtectedNamespaceDefinition(namespace) {
  return CEE_PROTECTED_NAMESPACES.find((d) => d.namespace === namespace) ?? null;
}
