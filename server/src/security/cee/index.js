/**
 * Course Entitlement Engine (CEE) — Protection Grid public API.
 */

export { requireEntitlement, attachEntitlementToRequest } from './requireEntitlement.js';
export { entitlementGuard, identityOnlyGuard } from './entitlementGuard.js';
export { assertStudentIdentity } from './identityGuard.js';
export {
  applyCeeProtectionGrid,
  ceeProtectionGridMiddleware,
  matchProtectionRule,
  extractRequestedCourseId,
  PROTECTION_GRID_RULES,
  ROUTE_PROTECTION_TABLE,
} from './protectionGrid.js';
export {
  CEE_PROTECTED_NAMESPACES,
  CEE_PROTECTED_NAMESPACE_PREFIXES,
  matchProtectedNamespace,
  getProtectedNamespaceDefinition,
} from './protectedNamespaceRegistry.js';
export {
  validateProtectionGridAtStartup,
  shouldRunProtectionGridStartupValidation,
} from './protectionGridValidator.js';
export { APPLICATION_API_MOUNTS } from './applicationMountManifest.js';
export {
  CeeUnknownProtectedRouteError,
  CeeProtectionGridMisconfiguredError,
  CeeProtectionGridDeniedError,
} from '../../errors/cee/ProtectionGridErrors.js';
export {
  requireActiveEntitlement,
  requireEntitlementForCourse,
  assertAttemptOwnership,
  assertResultOwnership,
  assertUploadFilenameOwnership,
} from './ownership/ownershipValidation.js';
export {
  getCeeQueryContext,
  runWithCeeQueryContext,
  isInstructionalPoolGuardEnabled,
} from './db/ceeQueryContext.js';
export {
  assertCourseScope,
  assertSqlCourseScoped,
  courseScopeWhere,
  queryScoped,
  validateScopedQuery,
  guardScopedQuery,
  detectProtectedTablesInSql,
  getRequiredScopeHints,
  wrapExecutorWithScopeGuard,
} from './scopedQueryGuard.js';
export {
  scopedQuery,
  scopedQueryBypass,
  scopedQueryFromRequest,
  scopedQueryOnce,
  ScopedQueryRunner,
  ScopedSelectBuilder,
  createFrozenScopeContext,
} from './db/scopedQuery.js';
export {
  validateBypassRequest,
  assertValidBypassReason,
  isBypassDeniedForHttpRoute,
  CEE_BYPASS_CATEGORIES,
  CEE_BYPASS_CONTEXT_BY_CATEGORY,
  logBypassEvent,
  CEE_BYPASS_SIEM_TAG,
} from './bypass/index.js';
export {
  CeeMissingCourseScopeError,
  CeeUnscopedQueryDeniedError,
  CeeInvalidBypassError,
  CeeBypassDeniedError,
  CeeProtectedTableAccessError,
} from '../../errors/cee/ScopedQueryErrors.js';
export {
  CEE_PROTECTED_TABLES,
  CEE_PROTECTED_TABLE_KEYS,
  CEE_PROTECTED_RELATIONAL_TABLE_NAMES,
  CEE_PROTECTED_SQL_TABLE_HINTS,
  isCeeProtectedTable,
  getCeeProtectedTable,
} from './protectedTableRegistry.js';
export {
  resolveEntitledTestBySlug,
  assertTestAccessibleForEntitlement,
  OrphanTestAccessDeniedError,
} from './testEntitlement.service.js';
export {
  CEE_VIOLATION_TYPES,
  CEE_VIOLATION_SIEM_TAG,
  VIOLATION_SCHEMA_VERSION,
  buildViolationRecord,
  formatSiemPayload,
  reportScopeViolation,
  reportMissingCourseScopeViolation,
  reportUnscopedProtectedQueryViolation,
} from './diagnostics/index.js';
export {
  CEE_AUDIT_SCHEMA_VERSION,
  CEE_SECURITY_AUDIT_TAG,
  CEE_AUDIT_ACTIONS,
  CEE_AUDIT_VIOLATION_TYPES,
  emitSecurityAuditEvent,
  buildSecurityAuditRecord,
  formatSecurityAuditLine,
  auditEntitlementFailure,
  isEntitlementAuditError,
} from './audit/index.js';
