/**
 * ScopedQueryRunner — safe MySQL execution bound to CEE scope context.
 *
 * All paths call validateScopedQuery() before executor.query() — fail-closed.
 */

import { mysqlPool } from '../../../config/mysql.js';
import { CeeInvalidBypassError } from '../../../errors/cee/ScopedQueryErrors.js';
import { courseScopeWhere, validateScopedQuery } from '../scopedQueryGuard.js';
import { getCeeProtectedTable } from '../protectedTableRegistry.js';
import { createFrozenScopeContext, toGuardOptions } from './scopeContext.js';
import { runWithCeeQueryContext } from './ceeQueryContext.js';

/** @typedef {import('./scopeContext.js').FrozenScopeContext} FrozenScopeContext */
/** @typedef {import('./scopeContext.js').ScopedQueryScopeInput} ScopedQueryScopeInput */

const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/i;
const QUALIFIED_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?$/i;

/**
 * @typedef {Record<string, string|number|boolean|null>} WhereFilters
 */

/**
 * @typedef {object} SelectBuilderOptions
 * @property {string} table
 * @property {ReadonlyArray<string>} [columns]
 * @property {WhereFilters} [filters]
 * @property {string} [orderBy] — pre-validated fragment e.g. "sort_order ASC"
 * @property {number} [limit]
 * @property {number} [offset]
 * @property {string} [courseScopeColumn] — default course_id
 */

export class ScopedQueryRunner {
  /** @type {FrozenScopeContext} */
  #scope;

  /** @type {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} */
  #executor;

  /**
   * @param {FrozenScopeContext} scope
   * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
   */
  constructor(scope, executor = mysqlPool) {
    this.#scope = scope;
    this.#executor = executor;
    Object.freeze(this);
  }

  /**
   * Factory — validates scope once; bypass cannot be added later.
   * @param {ScopedQueryScopeInput} scopeInput
   * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
   */
  static create(scopeInput, executor = mysqlPool) {
    const scope = createFrozenScopeContext(scopeInput);
    return new ScopedQueryRunner(scope, executor);
  }

  /** @returns {FrozenScopeContext} */
  get scope() {
    return this.#scope;
  }

  get courseId() {
    return this.#scope.courseId;
  }

  get context() {
    return this.#scope.context;
  }

  /**
   * Execute validated SQL (primary API).
   * @param {string} sql
   * @param {ReadonlyArray<unknown>} [params]
   * @returns {Promise<[unknown[], import('mysql2').FieldPacket[]]>}
   */
  async execute(sql, params = []) {
    const sqlText = String(sql || '').trim();
    if (!sqlText) {
      throw new CeeInvalidBypassError({ context: this.#scope.context, reason: 'empty_sql' });
    }

    const guardResult = validateScopedQuery(toGuardOptions(this.#scope, sqlText));
    this.#logDevDiagnostics('execute', sqlText, guardResult);

    return runWithCeeQueryContext(
      {
        validated: true,
        allowUnscoped: guardResult.bypassed,
        courseId: guardResult.courseId,
        context: this.#scope.context,
        userId: this.#scope.userId ?? null,
        requestId: this.#scope.requestId ?? null,
      },
      () => this.#executor.query(sqlText, [...params])
    );
  }

  /** Alias for execute */
  async query(sql, params = []) {
    return this.execute(sql, params);
  }

  /**
   * @param {string} sql
   * @param {ReadonlyArray<unknown>} [params]
   * @returns {Promise<unknown[]>}
   */
  async rows(sql, params = []) {
    const [rows] = await this.execute(sql, params);
    return rows;
  }

  /**
   * @param {string} sql
   * @param {ReadonlyArray<unknown>} [params]
   * @returns {Promise<unknown|undefined>}
   */
  async first(sql, params = []) {
    const rows = await this.rows(sql, params);
    return rows[0];
  }

  /**
   * Safe single-table SELECT builder for direct course_id scoped tables.
   * Automatically injects course_id = ? for protected tables with scopeColumn.
   *
   * @param {SelectBuilderOptions} options
   * @returns {Promise<unknown[]>}
   */
  async selectFrom(options) {
    const table = assertIdentifier(options.table, 'table');
    const columns = normalizeColumns(options.columns ?? ['*']);
    const courseScopeColumn = options.courseScopeColumn
      ? assertQualifiedColumn(options.courseScopeColumn, 'courseScopeColumn')
      : 'course_id';

    const def = getCeeProtectedTable(table);
    const params = [];
    const whereParts = [];

    if (def && !this.#scope.allowUnscoped) {
      if (def.scopeStrategy === 'root_course') {
        whereParts.push(`${table}.id = ?`);
        params.push(this.#scope.courseId);
      } else if (def.scopeStrategy === 'direct_course_id' && def.scopeColumn) {
        whereParts.push(courseScopeWhere(`${table}.${def.scopeColumn}`));
        params.push(this.#scope.courseId);
      } else {
        throw new CeeInvalidBypassError({
          context: this.#scope.context,
          table,
          reason: 'builder_requires_direct_course_scope',
          hint: 'Use db.execute() with full JOIN SQL for tables scoped via foreign keys (e.g. chapters, test_questions)',
        });
      }
    }

    const { clause: filterClause, params: filterParams } = buildWhereFromFilters(
      options.filters ?? {},
      table
    );
    if (filterClause) {
      whereParts.push(filterClause);
      params.push(...filterParams);
    }

    let sql = `SELECT ${columns.join(', ')} FROM ${table}`;
    if (whereParts.length) {
      sql += ` WHERE ${whereParts.join(' AND ')}`;
    }
    if (options.orderBy) {
      sql += ` ORDER BY ${assertOrderByFragment(options.orderBy)}`;
    }
    if (options.limit != null) {
      const lim = assertPositiveInt(options.limit, 'limit');
      sql += ` LIMIT ${lim}`;
      if (options.offset != null) {
        const off = assertPositiveInt(options.offset, 'offset');
        sql += ` OFFSET ${off}`;
      }
    }

    return this.rows(sql, params);
  }

  /**
   * Fluent builder entry.
   * @param {string} table
   */
  from(table) {
    return new ScopedSelectBuilder(this, table);
  }

  /**
   * @param {string} action
   * @param {string} sql
   * @param {import('../scopedQueryGuard.js').ScopedQueryGuardResult} guardResult
   */
  #logDevDiagnostics(action, sql, guardResult) {
    if (String(process.env.CEE_SCOPE_GUARD_VERBOSE || '') !== 'true') {
      return;
    }
    const snippet = sql.replace(/\s+/g, ' ').trim().slice(0, 200);
    console.debug(
      `[cee.scopedQuery] ${action} context=${this.#scope.context} courseId=${this.#scope.courseId ?? 'bypass'} ` +
        `tables=[${(guardResult.touchedTables || []).join(',')}] bypassed=${guardResult.bypassed} sql="${snippet}"`
    );
  }
}

/**
 * Fluent SELECT builder chained from scopedQuery().from('lectures')
 */
export class ScopedSelectBuilder {
  /** @type {ScopedQueryRunner} */
  #runner;
  /** @type {string} */
  #table;
  /** @type {string[]} */
  #columns;
  /** @type {WhereFilters} */
  #filters;
  /** @type {string|undefined} */
  #orderBy;
  /** @type {number|undefined} */
  #limit;
  /** @type {number|undefined} */
  #offset;
  /** @type {string} */
  #courseScopeColumn;

  /**
   * @param {ScopedQueryRunner} runner
   * @param {string} table
   */
  constructor(runner, table) {
    this.#runner = runner;
    this.#table = assertIdentifier(table, 'table');
    this.#columns = ['*'];
    this.#filters = {};
    this.#courseScopeColumn = 'course_id';
  }

  /**
   * @param {ReadonlyArray<string>|string} columns
   */
  select(columns) {
    this.#columns = normalizeColumns(columns);
    return this;
  }

  /**
   * @param {WhereFilters} filters
   */
  where(filters) {
    this.#filters = { ...this.#filters, ...filters };
    return this;
  }

  /**
   * @param {string} column — course scope column name
   */
  courseScopeColumn(column) {
    this.#courseScopeColumn = assertQualifiedColumn(column, 'courseScopeColumn');
    return this;
  }

  /**
   * @param {string} orderByFragment — e.g. "sort_order ASC, id DESC"
   */
  orderBy(orderByFragment) {
    this.#orderBy = assertOrderByFragment(orderByFragment);
    return this;
  }

  /**
   * @param {number} n
   * @param {number} [offset]
   */
  limit(n, offset) {
    this.#limit = assertPositiveInt(n, 'limit');
    if (offset != null) {
      this.#offset = assertPositiveInt(offset, 'offset');
    }
    return this;
  }

  /** @returns {Promise<unknown[]>} */
  async rows() {
    return this.#runner.selectFrom({
      table: this.#table,
      columns: this.#columns,
      filters: this.#filters,
      orderBy: this.#orderBy,
      limit: this.#limit,
      offset: this.#offset,
      courseScopeColumn: this.#courseScopeColumn,
    });
  }

  /** @returns {Promise<unknown|undefined>} */
  async first() {
    const rows = await this.rows();
    return rows[0];
  }
}

/**
 * @param {WhereFilters} filters
 * @param {string} table
 */
function buildWhereFromFilters(filters, table) {
  const parts = [];
  const params = [];

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    const col = assertQualifiedColumn(key, 'filterKey');
    if (col === 'course_id' || col.endsWith('.course_id')) {
      continue;
    }
    if (value === null) {
      parts.push(`${col} IS NULL`);
    } else {
      parts.push(`${col} = ?`);
      params.push(value);
    }
  }

  return {
    clause: parts.length ? parts.join(' AND ') : '',
    params,
  };
}

/**
 * @param {ReadonlyArray<string>|string} columns
 * @returns {string[]}
 */
function normalizeColumns(columns) {
  const list = Array.isArray(columns) ? columns : [columns];
  if (!list.length) {
    throw new CeeInvalidBypassError({ reason: 'empty_select_columns' });
  }
  return list.map((c) => {
    const s = String(c).trim();
    if (s === '*') return '*';
    return assertQualifiedColumn(s, 'column');
  });
}

function assertIdentifier(value, label) {
  const s = String(value || '').trim();
  if (!IDENTIFIER_PATTERN.test(s)) {
    throw new CeeInvalidBypassError({ reason: 'invalid_identifier', label, value: s });
  }
  return s;
}

function assertQualifiedColumn(value, label) {
  const s = String(value || '').trim();
  if (!QUALIFIED_IDENTIFIER_PATTERN.test(s)) {
    throw new CeeInvalidBypassError({ reason: 'invalid_column', label, value: s });
  }
  return s;
}

function assertOrderByFragment(fragment) {
  const s = String(fragment || '').trim();
  if (!/^[a-z0-9_.,\s]+(asc|desc)?$/i.test(s)) {
    throw new CeeInvalidBypassError({ reason: 'invalid_order_by', fragment: s });
  }
  return s;
}

function assertPositiveInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new CeeInvalidBypassError({ reason: 'invalid_positive_int', label, value });
  }
  return n;
}
