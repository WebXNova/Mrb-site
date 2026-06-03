/**
 * Installs fail-closed guard on mysql2 pool.query for CEE protected instructional tables.
 */

import {
  getCeeQueryContext,
  isInstructionalPoolGuardEnabled,
} from '../security/cee/db/ceeQueryContext.js';
import {
  detectProtectedTablesInSql,
} from '../security/cee/scopedQueryGuard.js';
import { reportUnscopedProtectedQueryViolation } from '../security/cee/diagnostics/violationReporter.js';
import { CeeUnscopedQueryDeniedError } from '../errors/cee/ScopedQueryErrors.js';

const GUARD_MARKER = Symbol('ceePoolGuardInstalled');

/**
 * @param {import('mysql2/promise').Pool} pool
 */
export function installInstructionalPoolGuard(pool) {
  if (!isInstructionalPoolGuardEnabled()) {
    return pool;
  }
  if (pool[GUARD_MARKER]) {
    return pool;
  }

  const originalQuery = pool.query.bind(pool);

  pool.query = async function guardedPoolQuery(sql, values) {
    const sqlText = typeof sql === 'string' ? sql : sql?.sql;
    if (sqlText) {
      const touched = detectProtectedTablesInSql(sqlText);
      if (touched.length > 0) {
        const ctx = getCeeQueryContext();
        if (!ctx?.validated) {
          reportUnscopedProtectedQueryViolation({
            context: 'mysqlPool.query',
            userId: null,
            requestId: null,
            courseId: null,
            protectedTables: touched,
            registryKeys: touched,
            sql: sqlText,
          });
          throw new CeeUnscopedQueryDeniedError({
            context: 'mysqlPool.query',
            touchedTables: touched,
            hint:
              'Use scopedQuery() or scopedQueryBypass() — raw pool access to instructional tables is denied',
          });
        }
      }
    }
    return originalQuery(sql, values);
  };

  pool[GUARD_MARKER] = true;
  return pool;
}
