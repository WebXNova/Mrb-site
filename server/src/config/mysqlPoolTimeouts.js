import { MySqlAcquireTimeoutError } from '../errors/mysql/MySqlAcquireTimeoutError.js';
import { MySqlTransactionTimeoutError } from '../errors/mysql/MySqlTransactionTimeoutError.js';
import { env } from './env.js';
import { logMysqlTimeoutEvent } from './mysqlTimeoutLogger.js';
import {
  isMysqlQueryTimeoutError,
  raceWithTimeout,
  rethrowQueryTimeout,
  withQueryTimeoutOptions,
} from './mysqlTimeout.util.js';

const TIMEOUT_MARKER = Symbol('mysqlPoolTimeoutGuardInstalled');

/**
 * @typedef {object} MysqlPoolTimeoutConfig
 * @property {number} acquireTimeoutMs
 * @property {number} queryTimeoutMs
 * @property {number} transactionTimeoutMs
 */

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {MysqlPoolTimeoutConfig} config
 * @returns {import('mysql2/promise').PoolConnection}
 */
export function wrapPooledConnection(connection, config) {
  if (connection[TIMEOUT_MARKER]) {
    return connection;
  }

  let transactionDeadlineMs = null;

  const assertTransactionNotExpired = () => {
    if (transactionDeadlineMs != null && Date.now() > transactionDeadlineMs) {
      logMysqlTimeoutEvent('transaction', {
        timeoutMs: config.transactionTimeoutMs,
        phase: 'deadline_exceeded',
      });
      throw new MySqlTransactionTimeoutError({ timeoutMs: config.transactionTimeoutMs });
    }
  };

  const wrapRunner =
    (original) =>
    async (sql, values) => {
      assertTransactionNotExpired();
      const [nextSql, nextValues] = withQueryTimeoutOptions(sql, values, config.queryTimeoutMs);
      try {
        return await original(nextSql, nextValues);
      } catch (err) {
        if (isMysqlQueryTimeoutError(err)) {
          logMysqlTimeoutEvent('query', {
            timeoutMs: config.queryTimeoutMs,
            phase: 'connection_query',
          });
        }
        rethrowQueryTimeout(err, config.queryTimeoutMs);
      }
    };

  if (typeof connection.query === 'function') {
    const originalQuery = connection.query.bind(connection);
    connection.query = wrapRunner(originalQuery);
  }

  if (typeof connection.execute === 'function') {
    const originalExecute = connection.execute.bind(connection);
    connection.execute = wrapRunner(originalExecute);
  }

  if (typeof connection.beginTransaction === 'function') {
    const originalBeginTransaction = connection.beginTransaction.bind(connection);
    connection.beginTransaction = async () => {
      const result = await originalBeginTransaction();
      transactionDeadlineMs = Date.now() + config.transactionTimeoutMs;
      return result;
    };
  }

  if (typeof connection.commit === 'function') {
    const originalCommit = connection.commit.bind(connection);
    connection.commit = async () => {
      assertTransactionNotExpired();
      transactionDeadlineMs = null;
      return originalCommit();
    };
  }

  if (typeof connection.rollback === 'function') {
    const originalRollback = connection.rollback.bind(connection);
    connection.rollback = async () => {
      transactionDeadlineMs = null;
      return originalRollback();
    };
  }

  connection[TIMEOUT_MARKER] = true;
  return connection;
}

/**
 * Install acquire / query / transaction timeout safeguards on a mysql2 pool.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {MysqlPoolTimeoutConfig} config
 */
export function installMysqlPoolTimeoutGuard(pool, config) {
  if (pool[TIMEOUT_MARKER]) {
    return pool;
  }

  const originalGetConnection = pool.getConnection.bind(pool);
  pool.getConnection = async function timedGetConnection() {
    try {
      const connection = await raceWithTimeout(
        originalGetConnection(),
        config.acquireTimeoutMs,
        () => new MySqlAcquireTimeoutError({ timeoutMs: config.acquireTimeoutMs }),
        (lateConnection) => {
          logMysqlTimeoutEvent('acquire', {
            timeoutMs: config.acquireTimeoutMs,
            phase: 'late_connection_released',
          });
          try {
            lateConnection.release();
          } catch {
            /* ignore */
          }
        }
      );
      return wrapPooledConnection(connection, config);
    } catch (err) {
      if (err instanceof MySqlAcquireTimeoutError) {
        logMysqlTimeoutEvent('acquire', {
          timeoutMs: config.acquireTimeoutMs,
          phase: 'queue_wait_exceeded',
        });
      }
      throw err;
    }
  };

  const originalQuery = pool.query.bind(pool);
  pool.query = async function timedQuery(sql, values) {
    const [nextSql, nextValues] = withQueryTimeoutOptions(sql, values, config.queryTimeoutMs);
    try {
      return await originalQuery(nextSql, nextValues);
    } catch (err) {
      if (isMysqlQueryTimeoutError(err)) {
        logMysqlTimeoutEvent('query', { timeoutMs: config.queryTimeoutMs, phase: 'pool_query' });
      }
      rethrowQueryTimeout(err, config.queryTimeoutMs);
    }
  };

  if (typeof pool.execute === 'function') {
    const originalExecute = pool.execute.bind(pool);
    pool.execute = async function timedExecute(sql, values) {
      const [nextSql, nextValues] = withQueryTimeoutOptions(sql, values, config.queryTimeoutMs);
      try {
        return await originalExecute(nextSql, nextValues);
      } catch (err) {
        if (isMysqlQueryTimeoutError(err)) {
          logMysqlTimeoutEvent('query', { timeoutMs: config.queryTimeoutMs, phase: 'pool_execute' });
        }
        rethrowQueryTimeout(err, config.queryTimeoutMs);
      }
    };
  }

  pool[TIMEOUT_MARKER] = true;
  return pool;
}

/**
 * Run a callback inside a transaction with pool-level timeout safeguards.
 * Prefer for new code; existing manual transactions inherit per-query + txn deadline on wrapped connections.
 *
 * @template T
 * @param {{ getConnection: () => Promise<import('mysql2/promise').PoolConnection> }} executor
 * @param {(connection: import('mysql2/promise').PoolConnection) => Promise<T>} fn
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<T>}
 */
export async function withMysqlTransaction(executor, fn, options = {}) {
  const connection = await executor.getConnection();
  const timeoutMs =
    Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : env.mysql.pool.transactionTimeoutMs;
  let timer = null;
  let timedOut = false;

  try {
    await connection.beginTransaction();

    const work = fn(connection);
    const result = await Promise.race([
      work,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          logMysqlTimeoutEvent('transaction', {
            timeoutMs,
            phase: 'withMysqlTransaction_race',
          });
          reject(new MySqlTransactionTimeoutError({ timeoutMs }));
        }, timeoutMs);
      }),
    ]);

    if (!timedOut) {
      await connection.commit();
    }
    return result;
  } catch (err) {
    if (timedOut) {
      try {
        connection.destroy();
      } catch {
        /* ignore */
      }
    } else {
      try {
        await connection.rollback();
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    if (!timedOut) {
      connection.release();
    }
  }
}
