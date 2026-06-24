/**
 * CEE Scoped Query Guard — DB-level enforcement for protected instructional tables.
 *
 * Security infrastructure (not a convenience helper):
 * - Intercepts SQL touching CEE_PROTECTED_TABLES
 * - Requires course_id (or registry join-path) scoping — fail-closed by default
 * - Explicit audited bypass: { allowUnscoped: true, reason: '{category}:{descriptor}' }
 *   Categories: admin_job | analytics | migration — denied on student/public routes
 * - Structured AppError subclasses (never silent deny)
 * - Violation diagnostics: diagnostics/violationReporter.js (dev banners + SIEM)
 * - Bypass audit channel: [cee.scope.audit] + optional activity_logs
 *
 * @see protectedTableRegistry.js
 */

import { env } from '../../config/env.js';
import { CEE_AUDIT_ACTIONS, CEE_AUDIT_VIOLATION_TYPES } from './audit/auditSchema.js';
import { emitSecurityAuditEvent } from './audit/securityAuditLogger.js';
import {
  CeeInvalidBypassError,
  CeeMissingCourseScopeError,
  CeeUnscopedQueryDeniedError,
} from '../../errors/cee/ScopedQueryErrors.js';
import {
  reportMissingCourseScopeViolation,
  reportUnscopedProtectedQueryViolation,
} from './diagnostics/violationReporter.js';
import { validateBypassRequest } from './bypass/bypassPolicy.js';
import { logBypassEvent } from './bypass/bypassAuditLogger.js';
import { runWithCeeQueryContext } from './db/ceeQueryContext.js';
import {
  CEE_PROTECTED_RELATIONAL_TABLE_NAMES,
  CEE_PROTECTED_TABLES,
  getCeeProtectedTable,
  isCeeProtectedTable,
} from './protectedTableRegistry.js';

const MAX_SQL_SNIPPET_LOG = 240;

/** @typedef {import('./protectedTableRegistry.js').CeeProtectedTableDefinition} CeeProtectedTableDefinition */

/**
 * @typedef {object} ScopedQueryGuardOptions
 * @property {string} sql
 * @property {number|null|undefined} [courseId]
 * @property {string} [context] — caller label for audit (e.g. 'studentPortal.loadLectures')
 * @property {boolean} [allowUnscoped=false]
 * @property {string} [reason] — required when allowUnscoped: `admin_job:…` | `analytics:…` | `migration:…`
 * @property {string} [bypassReason] — alias for reason
 * @property {import('./bypass/bypassPolicy.js').CeeBypassCategory} [bypassCategory]
 * @property {number|null} [userId]
 * @property {string|null} [requestId]
 * @property {string} [route] — HTTP route label for diagnostics (e.g. 'GET /api/student/dashboard')
 * @property {boolean} [skipAudit=false]
 */

/**
 * @typedef {object} ScopedQueryGuardResult
 * @property {boolean} allowed
 * @property {boolean} bypassed
 * @property {number|null} courseId
 * @property {ReadonlyArray<string>} touchedTables
 * @property {ReadonlyArray<string>} registryKeys
 */

const TABLE_REFERENCE_PATTERN =
  /\b(?:from|join|into|update|delete\s+from)\s+`?([a-z][a-z0-9_]*)`?/gi;

const COURSE_SCOPE_PATTERNS = [
  /\bcourse_id\s*=\s*\?/i,
  /\bcourse_id\s*=\s*['"]?\d+/i,
  /\bcourse_id\s+in\s*\(/i,
  /\bcourses\.id\s*=\s*\?/i,
  /\bcourses\.id\s*=\s*['"]?\d+/i,
  /\b(?:subjects|lectures|tests)\.course_id\s*=\s*\?/i,
];

const ROOT_COURSE_PATTERNS = [/\bcourses\.id\s*=\s*\?/i, /\bwhere\s+id\s*=\s*\?/i];

/**
 * @param {string} sql
 * @returns {string}
 */
function normalizeSqlForAnalysis(sql) {
  return String(sql || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n\r]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Detect physical MySQL table names referenced in SQL.
 * @param {string} sql
 * @returns {string[]} unique protected table names touched
 */
export function detectProtectedTablesInSql(sql) {
  const normalized = normalizeSqlForAnalysis(sql);
  if (!normalized) return [];

  const found = new Set();
  let match;
  const pattern = new RegExp(TABLE_REFERENCE_PATTERN.source, TABLE_REFERENCE_PATTERN.flags);
  while ((match = pattern.exec(normalized)) !== null) {
    const name = match[1];
    if (isCeeProtectedTable(name)) {
      found.add(name);
    }
  }

  return [...found];
}

/**
 * Map physical table names to registry keys.
 * @param {ReadonlyArray<string>} tableNames
 * @returns {string[]}
 */
function tableNamesToRegistryKeys(tableNames) {
  const keys = new Set();
  for (const tableName of tableNames) {
    for (const [key, def] of Object.entries(CEE_PROTECTED_TABLES)) {
      if (def.tableName === tableName) {
        keys.add(key);
      }
    }
  }
  return [...keys];
}

/**
 * @param {number|null|undefined} courseId
 * @param {{ context?: string, sql?: string, touchedTables?: string[] }} [meta]
 * @returns {number}
 */
export function assertCourseScope(courseId, meta = {}) {
  const cid = Number(courseId);
  if (!Number.isInteger(cid) || cid <= 0) {
    if (!meta.skipViolationReport) {
      reportMissingCourseScopeViolation({
        context: meta.context ?? 'assertCourseScope',
        route: meta.route,
        userId: meta.userId,
        requestId: meta.requestId,
        protectedTables: meta.touchedTables ?? [],
        registryKeys: meta.registryKeys ?? [],
        sql: meta.sql,
        skipAudit: meta.skipAudit,
        skipConsole: meta.skipConsole,
      });
    }
    throw new CeeMissingCourseScopeError({
      context: meta.context ?? 'assertCourseScope',
      touchedTables: meta.touchedTables ?? [],
      sqlSnippet: meta.sql ? truncateSql(meta.sql) : undefined,
    });
  }
  return cid;
}

/**
 * @param {string} normalizedSql
 * @param {ReadonlyArray<string>} touchedTables
 * @returns {boolean}
 */
function sqlContainsCourseScope(normalizedSql, touchedTables) {
  if (COURSE_SCOPE_PATTERNS.some((p) => p.test(normalizedSql))) {
    return true;
  }

  for (const tableName of touchedTables) {
    const registryKey = Object.entries(CEE_PROTECTED_TABLES).find(([, d]) => d.tableName === tableName)?.[0];
    if (!registryKey) continue;
    const def = CEE_PROTECTED_TABLES[registryKey];
    if (def.scopeStrategy === 'root_course' && ROOT_COURSE_PATTERNS.some((p) => p.test(normalizedSql))) {
      return true;
    }
    for (const fragment of def.joinPath) {
      const hint = String(fragment).toLowerCase();
      if (hint.includes('course_id') && normalizedSql.includes('course_id')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * @param {string} sql
 */
function truncateSql(sql) {
  const s = String(sql || '').replace(/\s+/g, ' ').trim();
  return s.length <= MAX_SQL_SNIPPET_LOG ? s : `${s.slice(0, MAX_SQL_SNIPPET_LOG)}…`;
}

function isDevVerbose() {
  return String(process.env.CEE_SCOPE_GUARD_VERBOSE || '').toLowerCase() === 'true';
}

/**
 * Core validation — call before any instructional SQL executes.
 * Fail-closed: throws on missing scope; never returns allowed:true for unscoped protected access.
 *
 * @param {ScopedQueryGuardOptions} options
 * @returns {ScopedQueryGuardResult}
 */
export function validateScopedQuery(options) {
  const sql = String(options.sql || '');
  const context = String(options.context || 'validateScopedQuery');
  const touchedTables = detectProtectedTablesInSql(sql);
  const registryKeys = tableNamesToRegistryKeys(touchedTables);

  if (touchedTables.length === 0) {
    return {
      allowed: true,
      bypassed: false,
      courseId:
        options.courseId != null
          ? assertCourseScope(options.courseId, {
              context,
              route: options.route,
              userId: options.userId,
              requestId: options.requestId,
              skipAudit: options.skipAudit,
            })
          : null,
      touchedTables,
      registryKeys,
    };
  }

  if (options.allowUnscoped === true) {
    const bypass = validateBypassRequest({
      allowUnscoped: true,
      reason: options.reason,
      bypassReason: options.bypassReason,
      bypassCategory: options.bypassCategory,
      context,
      route: options.route ?? null,
    });

    if (!options.skipAudit) {
      logBypassEvent({
        context,
        reason: bypass.reason,
        category: bypass.category,
        touchedTables,
        registryKeys,
        sqlSnippet: truncateSql(sql),
        userId: options.userId ?? null,
        requestId: options.requestId ?? null,
        route: options.route ?? null,
        courseId: options.courseId ?? null,
        skipPersist: false,
      });
    }

    return {
      allowed: true,
      bypassed: true,
      courseId: null,
      touchedTables,
      registryKeys,
    };
  }

  const courseId = assertCourseScope(options.courseId, {
    context,
    sql,
    touchedTables,
    registryKeys,
    route: options.route,
    userId: options.userId,
    requestId: options.requestId,
    skipAudit: options.skipAudit,
  });

  const normalized = normalizeSqlForAnalysis(sql);
  if (!sqlContainsCourseScope(normalized, touchedTables)) {
    reportUnscopedProtectedQueryViolation({
      context,
      route: options.route,
      userId: options.userId ?? null,
      requestId: options.requestId ?? null,
      courseId,
      protectedTables: touchedTables,
      registryKeys,
      sql,
      skipAudit: options.skipAudit,
    });
    throw new CeeUnscopedQueryDeniedError({
      context,
      courseId,
      touchedTables,
      registryKeys,
      sqlSnippet: truncateSql(sql),
      hint: 'Add course_id = ? (or registry joinPath) for all protected table access',
    });
  }

  if (isDevVerbose()) {
    emitSecurityAuditEvent({
      action: CEE_AUDIT_ACTIONS.SCOPE_ALLOWED,
      violationType: 'SCOPE_ALLOWED',
      outcome: 'allowed',
      reason: 'course_scope_validated',
      context,
      tables: touchedTables,
      registryKeys,
      courseId,
      sqlSnippet: truncateSql(sql),
      skipPersist: true,
    });
  }

  return {
    allowed: true,
    bypassed: false,
    courseId,
    touchedTables,
    registryKeys,
  };
}

/**
 * Alias for validateScopedQuery — semantic name for middleware/services.
 * @param {ScopedQueryGuardOptions} options
 */
export function guardScopedQuery(options) {
  return validateScopedQuery(options);
}

/**
 * Validate SQL string (throws on violation).
 * @param {string} sql
 * @param {number} courseId
 * @param {Omit<ScopedQueryGuardOptions, 'sql'|'courseId'>} [options]
 */
export function assertSqlCourseScoped(sql, courseId, options = {}) {
  return validateScopedQuery({
    sql,
    courseId,
    context: options.context ?? 'assertSqlCourseScoped',
    allowUnscoped: options.allowUnscoped,
    reason: options.reason,
    bypassReason: options.bypassReason,
    bypassCategory: options.bypassCategory,
    userId: options.userId,
    requestId: options.requestId,
    skipAudit: options.skipAudit,
  });
}

/**
 * Build parameterized WHERE fragment for course scoping.
 * @param {string} [columnRef]
 */
export function courseScopeWhere(columnRef = 'course_id') {
  const col = String(columnRef || 'course_id').trim();
  if (!/^[a-z_][a-z0-9_.]*$/i.test(col)) {
    throw new CeeInvalidBypassError({ reason: 'invalid_column_ref', columnRef: col });
  }
  return `${col} = ?`;
}

/**
 * Recommended join/where hints for a registry table.
 * @param {string} registryKeyOrTableName
 * @returns {ReadonlyArray<string>}
 */
export function getRequiredScopeHints(registryKeyOrTableName) {
  const def =
    getCeeProtectedTable(registryKeyOrTableName) ??
    Object.values(CEE_PROTECTED_TABLES).find((d) => d.tableName === registryKeyOrTableName);
  if (!def) return Object.freeze([]);
  if (def.scopeColumn) {
    return Object.freeze([`${def.tableName}.${def.scopeColumn} = ?`, `course_id = ?`]);
  }
  return Object.freeze([...def.joinPath]);
}

/**
 * Execute SQL only after scope validation (course_id must appear in SQL).
 * Prefer `scopedQuery()` from `./db/scopedQuery.js` for new code.
 *
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 * @param {string} sql
 * @param {number} courseId
 * @param {Array<unknown>} [params]
 * @param {Omit<ScopedQueryGuardOptions, 'sql'|'courseId'>} [guardOptions]
 */
export async function queryScoped(executor, sql, courseId, params = [], guardOptions = {}) {
  validateScopedQuery({
    sql,
    courseId,
    ...guardOptions,
    context: guardOptions.context ?? 'queryScoped',
  });
  return executor.query(sql, params);
}

/**
 * Wrap a MySQL executor so every .query() passes through validateScopedQuery.
 *
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 * @param {Omit<ScopedQueryGuardOptions, 'sql'> & { courseId?: number|null }} scopeContext
 * @returns {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection}
 */
export function wrapExecutorWithScopeGuard(executor, scopeContext) {
  if (!executor || typeof executor.query !== 'function') {
    throw new TypeError('wrapExecutorWithScopeGuard requires a mysql2 Pool or PoolConnection');
  }

  const originalQuery = executor.query.bind(executor);

  executor.query = async function guardedQuery(sql, values) {
    const sqlText = typeof sql === 'string' ? sql : sql?.sql;
    if (!sqlText) {
      return originalQuery(sql, values);
    }

    const guardResult = validateScopedQuery({
      sql: sqlText,
      courseId: scopeContext.courseId,
      context: scopeContext.context ?? 'wrappedExecutor.query',
      allowUnscoped: scopeContext.allowUnscoped,
      reason: scopeContext.bypassReason,
      bypassReason: scopeContext.bypassReason,
      bypassCategory: scopeContext.bypassCategory,
      userId: scopeContext.userId,
      requestId: scopeContext.requestId,
      route: scopeContext.route,
      skipAudit: scopeContext.skipAudit,
    });

    return runWithCeeQueryContext(
      {
        validated: true,
        allowUnscoped: guardResult.bypassed,
        courseId: guardResult.courseId,
        context: scopeContext.context ?? 'wrappedExecutor.query',
        userId: scopeContext.userId ?? null,
        requestId: scopeContext.requestId ?? null,
      },
      () => originalQuery(sql, values)
    );
  };

  return executor;
}

/** @deprecated Use detectProtectedTablesInSql */
export const CEE_PROTECTED_SQL_TABLE_HINTS = CEE_PROTECTED_RELATIONAL_TABLE_NAMES;

export {
  validateBypassRequest,
  assertValidBypassReason,
  isBypassDeniedForHttpRoute,
  CEE_BYPASS_CATEGORIES,
  CEE_BYPASS_CONTEXT_BY_CATEGORY,
} from './bypass/bypassPolicy.js';

export { logBypassEvent, CEE_BYPASS_SIEM_TAG } from './bypass/bypassAuditLogger.js';
