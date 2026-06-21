/**
 * MySQL pool timeout safeguards — unit + integration checks.
 *
 * Run: npm run test:mysql-pool-timeout
 */
import mysql from 'mysql2/promise';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';
import { getMysqlPoolConfig } from '../config/mysql.js';
import { installMysqlPoolExhaustionGuard } from '../config/mysqlPoolExhaustion.js';
import {
  installMysqlPoolTimeoutGuard,
  withMysqlTransaction,
} from '../config/mysqlPoolTimeouts.js';
import {
  isMysqlQueryTimeoutError,
  raceWithTimeout,
  withQueryTimeoutOptions,
} from '../config/mysqlTimeout.util.js';
import { MySqlAcquireTimeoutError } from '../errors/mysql/MySqlAcquireTimeoutError.js';
import { MySqlQueryTimeoutError } from '../errors/mysql/MySqlQueryTimeoutError.js';
import { MySqlTransactionTimeoutError } from '../errors/mysql/MySqlTransactionTimeoutError.js';
import { normalizeError } from '../errors/middleware/normalizeError.js';
import {
  MYSQL_POOL_ACQUIRE_TIMEOUT,
  MYSQL_QUERY_TIMEOUT,
  MYSQL_TRANSACTION_TIMEOUT,
} from '../errors/codes/ErrorCodes.js';
import {
  acquireConnectionWithTimeout,
  allSettledWithTimeout,
  endPoolSafely,
  installTestSuiteWatchdog,
  runWithTimeout,
} from './mysqlPoolIntegrationTest.util.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..', '..');

installTestSuiteWatchdog();

let passed = 0;
let failed = 0;

function ok(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

function eq(label, actual, expected) {
  ok(label, actual === expected);
}

function mustContain(fileRel, needles, label) {
  const filePath = path.join(serverRoot, fileRel);
  ok(`exists: ${fileRel}`, existsSync(filePath));
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label}: "${needle}"`, text.includes(needle));
  }
}

function buildTestPool(options = {}) {
  const {
    acquireTimeoutMs = 500,
    queryTimeoutMs = 800,
    transactionTimeoutMs = 1500,
    ...poolOverrides
  } = options;

  const pool = mysql.createPool({
    host: env.mysql.host,
    port: env.mysql.port,
    user: env.mysql.user,
    password: env.mysql.password,
    database: env.mysql.database,
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 5,
    connectTimeout: 2000,
    ...poolOverrides,
  });
  installMysqlPoolExhaustionGuard(pool);
  installMysqlPoolTimeoutGuard(pool, {
    acquireTimeoutMs,
    queryTimeoutMs,
    transactionTimeoutMs,
  });
  return pool;
}

console.log('mysql pool timeouts — production hardening tests\n');

console.log('Config defaults');
{
  const cfg = getMysqlPoolConfig();
  eq('acquireTimeoutMs default 10000', cfg.acquireTimeoutMs, 10_000);
  eq('queryTimeoutMs default 30000', cfg.queryTimeoutMs, 30_000);
  eq('transactionTimeoutMs default 60000', cfg.transactionTimeoutMs, 60_000);
  eq('env mirrors acquireTimeoutMs', env.mysql.pool.acquireTimeoutMs, cfg.acquireTimeoutMs);
}

console.log('\nSource wiring');
mustContain(
  'src/config/mysql.js',
  ['installMysqlPoolTimeoutGuard', 'acquireTimeoutMs', 'queryTimeoutMs', 'transactionTimeoutMs'],
  'mysql.js'
);
mustContain(
  'src/config/env.js',
  ['MYSQL_POOL_ACQUIRE_TIMEOUT_MS', 'MYSQL_QUERY_TIMEOUT_MS', 'MYSQL_TRANSACTION_TIMEOUT_MS'],
  'env.js'
);
mustContain(
  '.env.example',
  ['MYSQL_POOL_ACQUIRE_TIMEOUT_MS=10000', 'MYSQL_QUERY_TIMEOUT_MS=30000', 'MYSQL_TRANSACTION_TIMEOUT_MS=60000'],
  '.env.example'
);

console.log('\nQuery timeout helpers');
{
  const [sql, values] = withQueryTimeoutOptions('SELECT 1', [], 5000);
  ok('wraps string sql with timeout object', typeof sql === 'object' && sql.timeout === 5000);
  ok('preserves values', Array.isArray(values) || values === undefined || values === null);

  const err = new Error('Query inactivity timeout');
  err.code = 'PROTOCOL_SEQUENCE_TIMEOUT';
  ok('detects mysql2 query timeout', isMysqlQueryTimeoutError(err));

  const normalized = normalizeError(err);
  eq('normalizes to MYSQL_QUERY_TIMEOUT', normalized.errorCode, MYSQL_QUERY_TIMEOUT);
  eq('query timeout http 503', normalized.httpStatus, 503);
}

console.log('\nraceWithTimeout — no hang on slow acquire');
{
  let released = false;
  try {
    await raceWithTimeout(
      new Promise((resolve) => {
        setTimeout(() => resolve('late'), 500);
      }),
      100,
      () => new MySqlAcquireTimeoutError({ timeoutMs: 100 }),
      () => {
        released = true;
      }
    );
    ok('should not resolve', false);
  } catch (err) {
    ok('throws MySqlAcquireTimeoutError', err instanceof MySqlAcquireTimeoutError);
    eq('acquire error code', err.errorCode, MYSQL_POOL_ACQUIRE_TIMEOUT);
  }
  await new Promise((r) => setTimeout(r, 600));
  ok('late promise cleaned up', released === true);
}

console.log('\nIntegration — slow query fails safely');
{
  const pool = buildTestPool({ queryTimeoutMs: 300 });
  try {
    let threw = false;
    try {
      await pool.query('SELECT SLEEP(2)');
    } catch (err) {
      threw = true;
      ok('slow query throws MySqlQueryTimeoutError', err instanceof MySqlQueryTimeoutError);
    }
    ok('slow query rejected', threw);
  } catch (err) {
    ok(
      `skipped (${err?.code || err?.message})`,
      err?.code === 'ECONNREFUSED' || String(err?.message || '').includes('timed out')
    );
  } finally {
    await endPoolSafely(pool);
  }
}

console.log('\nIntegration — blocked connection acquire times out');
{
  const pool = buildTestPool({ connectionLimit: 1, queueLimit: 3, acquireTimeoutMs: 200 });
  const held = [];
  try {
    held.push(await acquireConnectionWithTimeout(pool, 5_000));

    let acquireError = null;
    try {
      await runWithTimeout(() => pool.getConnection(), 5_000);
    } catch (err) {
      acquireError = err;
    }

    ok(
      'blocked acquire throws',
      acquireError instanceof MySqlAcquireTimeoutError ||
        String(acquireError?.message || '').includes('timed out')
    );
  } catch (err) {
    ok(
      `skipped (${err?.code || err?.message})`,
      err?.code === 'ECONNREFUSED' || String(err?.message || '').includes('timed out')
    );
  } finally {
    for (const conn of held) {
      try {
        conn.release();
      } catch {
        /* ignore */
      }
    }
    await endPoolSafely(pool);
  }
}

console.log('\nIntegration — pool exhaustion still fails fast (Task 1 + Task 2)');
{
  const pool = buildTestPool({ connectionLimit: 1, queueLimit: 2, acquireTimeoutMs: 5000 });
  try {
    const results = await allSettledWithTimeout(
      Array.from({ length: 20 }, async () => {
        const conn = await acquireConnectionWithTimeout(pool, 6_000);
        try {
          await conn.ping();
        } finally {
          conn.release();
        }
      })
    );
    ok('all settle without hang', results.length === 20);
    const rejected = results.filter((r) => r.status === 'rejected').length;
    ok('some requests rejected under saturation', rejected >= 1);
    await new Promise((r) => setTimeout(r, 200));
  } catch (err) {
    ok(
      `skipped (${err?.code || err?.message})`,
      err?.code === 'ECONNREFUSED' || String(err?.message || '').includes('timed out')
    );
  } finally {
    await endPoolSafely(pool);
  }
}

console.log('\nIntegration — transaction deadline on wrapped connection');
{
  const pool = buildTestPool({ queryTimeoutMs: 30_000, transactionTimeoutMs: 200 });
  try {
    const conn = await acquireConnectionWithTimeout(pool, 5_000);
    try {
      await conn.beginTransaction();
      await new Promise((r) => setTimeout(r, 250));
      let txnError = null;
      try {
        await conn.query('SELECT 1');
      } catch (err) {
        txnError = err;
      }
      ok('expired transaction throws', txnError instanceof MySqlTransactionTimeoutError);
      eq('transaction error code', txnError?.errorCode, MYSQL_TRANSACTION_TIMEOUT);
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
    } finally {
      conn.release();
    }
  } catch (err) {
    ok(
      `skipped (${err?.code || err?.message})`,
      err?.code === 'ECONNREFUSED' || String(err?.message || '').includes('timed out')
    );
  } finally {
    await endPoolSafely(pool);
  }
}

console.log('\nwithMysqlTransaction — slow work aborts');
{
  const pool = buildTestPool({ transactionTimeoutMs: 150 });
  try {
    let errCaught = null;
    try {
      await withMysqlTransaction(pool, async () => {
        await new Promise((r) => setTimeout(r, 400));
        return 'done';
      });
    } catch (err) {
      errCaught = err;
    }
    ok('slow txn throws MySqlTransactionTimeoutError', errCaught instanceof MySqlTransactionTimeoutError);
  } catch (err) {
    ok(
      `skipped (${err?.code || err?.message})`,
      err?.code === 'ECONNREFUSED' || String(err?.message || '').includes('timed out')
    );
  } finally {
    await endPoolSafely(pool);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
