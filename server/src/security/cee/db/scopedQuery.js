/**
 * scopedQuery() — safe database access factory for the Course Entitlement Engine.
 *
 * Usage:
 *   const db = scopedQuery({ courseId, context: 'service.method', userId });
 *   const lectures = await db.rows(`SELECT ... WHERE course_id = ?`, [courseId]);
 *
 *   // Fluent builder (single protected table, auto course_id injection):
 *   const rows = await db.from('lectures').select(['id', 'title']).where({ is_active: true }).rows();
 *
 * Security:
 * - Every query path validates via scopedQueryGuard before execution
 * - allowUnscoped + reason must be set at factory time (not per-query)
 * - Fail-closed; no silent fallback
 *
 * @module security/cee/db/scopedQuery
 */

import { mysqlPool } from '../../../config/mysql.js';
import { CeeBypassDeniedError } from '../../../errors/cee/ScopedQueryErrors.js';
import { validateBypassRequest } from '../bypass/bypassPolicy.js';
import { ScopedQueryRunner } from './ScopedQueryRunner.js';

export { ScopedQueryRunner, ScopedSelectBuilder } from './ScopedQueryRunner.js';
export { createFrozenScopeContext } from './scopeContext.js';

/**
 * @typedef {import('./scopeContext.js').ScopedQueryScopeInput} ScopedQueryScopeInput
 */

/**
 * Create a scope-bound query runner. All queries must go through this instance.
 *
 * @param {ScopedQueryScopeInput} scope
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 * @returns {ScopedQueryRunner}
 *
 * @example
 * // Entitled student read
 * const db = scopedQuery({
 *   courseId: entitlement.courseId,
 *   context: 'studentPortal.loadLectures',
 *   userId: studentId,
 * });
 * const lectures = await db.rows(
 *   `SELECT id, title FROM lectures WHERE course_id = ? AND is_active = TRUE`,
 *   [entitlement.courseId]
 * );
 *
 * @example
 * // Audited bypass — use scopedQueryBypass() (admin_job | analytics | migration only)
 * const adminDb = scopedQueryBypass({
 *   reason: 'admin_job:tests_global_list_v1',
 *   context: 'admin.tests.listAll',
 *   userId: adminId,
 * });
 */
export function scopedQuery(scope, executor = mysqlPool) {
  if (scope?.allowUnscoped === true) {
    validateBypassRequest({
      allowUnscoped: true,
      reason: scope.reason,
      bypassReason: scope.bypassReason,
      bypassCategory: scope.bypassCategory,
      context: scope.context ?? '',
      route: scope.route ?? null,
    });
  }
  return ScopedQueryRunner.create(scope, executor);
}

/**
 * Audited unscoped access for admin jobs, analytics, and migrations only.
 * Bypass cannot be used with scopedQueryFromRequest (student/public APIs).
 *
 * @param {import('./scopeContext.js').ScopedQueryScopeInput} scope
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export function scopedQueryBypass(scope, executor = mysqlPool) {
  return scopedQuery({ ...scope, allowUnscoped: true }, executor);
}

/**
 * Build scopedQuery from Express request after CEE entitlement guard.
 * @param {import('express').Request} req
 * @param {string} context
 * @returns {ScopedQueryRunner}
 */
export function scopedQueryFromRequest(req, context, scopeOverrides = null) {
  if (scopeOverrides?.allowUnscoped === true) {
    throw new CeeBypassDeniedError({
      denialReason: 'bypass_via_request_factory_forbidden',
      hint: 'Use scopedQueryBypass() only in admin/job code — never from HTTP request handlers',
    });
  }

  const courseId = req.cee?.courseId ?? req.entitlement?.courseId ?? null;
  const path = req.originalUrl || req.url || req.path || '';
  const route = `${String(req.method || 'GET').toUpperCase()} ${path}`;
  return scopedQuery({
    courseId,
    context,
    userId: req.user?.id ?? null,
    requestId: req.requestId ?? null,
    route,
    allowUnscoped: false,
  });
}

/**
 * Execute one-shot scoped query without retaining runner (convenience).
 * @param {ScopedQueryScopeInput & { sql: string, params?: ReadonlyArray<unknown> }} input
 */
export async function scopedQueryOnce(input, executor = mysqlPool) {
  const { sql, params = [], ...scope } = input;
  const runner = ScopedQueryRunner.create(scope, executor);
  return runner.execute(sql, params);
}
