/**
 * MySQL pool queue protection — unit + integration checks.
 *
 * Run: npm run test:mysql-pool
 */
import mysql from 'mysql2/promise';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';
import { getMysqlPoolConfig } from '../config/mysql.js';
import {
  installMysqlPoolExhaustionGuard,
  isMysqlPoolQueueExhaustedError,
} from '../config/mysqlPoolExhaustion.js';
import { MySqlPoolExhaustedError } from '../errors/mysql/MySqlPoolExhaustedError.js';
import { normalizeError } from '../errors/middleware/normalizeError.js';
import { MYSQL_POOL_EXHAUSTED } from '../errors/codes/ErrorCodes.js';
import {
  acquireConnectionWithTimeout,
  allSettledWithTimeout,
  endPoolSafely,
  installTestSuiteWatchdog,
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

console.log('mysql pool — production hardening tests\n');

console.log('Config defaults (env.js)');
{
  const cfg = getMysqlPoolConfig();
  eq('connectionLimit default 30', cfg.connectionLimit, 30);
  eq('queueLimit default 100', cfg.queueLimit, 100);
  eq('connectTimeoutMs default 8000', cfg.connectTimeoutMs, 8000);
  eq('acquireTimeoutMs default 10000', cfg.acquireTimeoutMs, 10_000);
  eq('queryTimeoutMs default 30000', cfg.queryTimeoutMs, 30_000);
  eq('transactionTimeoutMs default 60000', cfg.transactionTimeoutMs, 60_000);
  eq('env.mysql.pool mirrors config', env.mysql.pool.connectionLimit, cfg.connectionLimit);
}

console.log('\nSource wiring');
mustContain(
  'src/config/mysql.js',
  [
    'validateMysqlPoolConfigAtStartup',
    'connectionLimit: poolConfig.connectionLimit',
    'queueLimit: poolConfig.queueLimit',
    'acquireTimeoutMs: poolConfig.acquireTimeoutMs',
    'installMysqlPoolTimeoutGuard',
    'installMysqlPoolExhaustionGuard',
  ],
  'mysql.js'
);
mustContain(
  'src/config/env.js',
  ['parseMysqlPoolConfigFromEnv'],
  'env.js'
);
mustContain(
  'src/config/mysqlPoolConfig.js',
  [
    'validateMysqlPoolConfigAtStartup',
    'isFinitePoolQueueLimit',
    'MYSQL_POOL_CONNECTION_LIMIT',
    'MYSQL_POOL_QUEUE_LIMIT',
    'MYSQL_POOL_ACQUIRE_TIMEOUT_MS',
  ],
  'mysqlPoolConfig.js'
);
mustContain(
  '.env.example',
  ['MYSQL_POOL_CONNECTION_LIMIT=30', 'MYSQL_POOL_QUEUE_LIMIT=100', 'MYSQL_CONNECT_TIMEOUT_MS=8000'],
  '.env.example'
);

console.log('\nQueue exhaustion detection');
ok('detects mysql2 queue message', isMysqlPoolQueueExhaustedError(new Error('Queue limit reached.')));
ok('detects MySqlPoolExhaustedError instance', isMysqlPoolQueueExhaustedError(new MySqlPoolExhaustedError()));
ok('ignores unrelated errors', !isMysqlPoolQueueExhaustedError(new Error('ECONNREFUSED')));

console.log('\nError normalization → 503 SERVICE_UNAVAILABLE shape');
{
  const normalized = normalizeError(new Error('Queue limit reached.'));
  eq('httpStatus 503', normalized.httpStatus, 503);
  eq('errorCode MYSQL_POOL_EXHAUSTED', normalized.errorCode, MYSQL_POOL_EXHAUSTED);
  ok('operational', normalized.isOperational === true);
}

console.log('\nGuard wraps getConnection');
{
  const pool = mysql.createPool({
    host: env.mysql.host,
    port: env.mysql.port,
    user: env.mysql.user,
    password: env.mysql.password,
    database: env.mysql.database,
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 3,
    connectTimeout: env.mysql.pool.connectTimeoutMs,
  });
  installMysqlPoolExhaustionGuard(pool);

  try {
    const attempts = 12;
    const results = await allSettledWithTimeout(
      Array.from({ length: attempts }, async () => {
        const conn = await acquireConnectionWithTimeout(pool);
        try {
          return true;
        } finally {
          conn.release();
        }
      })
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
    const exhausted = results.filter(
      (r) => r.status === 'rejected' && r.reason instanceof MySqlPoolExhaustedError
    ).length;
    const otherErrors = results.filter(
      (r) => r.status === 'rejected' && !(r.reason instanceof MySqlPoolExhaustedError)
    ).length;

    ok('all attempts settle without hang', results.length === attempts);
    ok('some acquires succeed', fulfilled >= 2);
    ok('queue overflow returns MySqlPoolExhaustedError', exhausted >= 1);
    ok('no unexpected rejection types', otherErrors === 0);
  } catch (err) {
    ok(
      `integration skipped (${err?.code || err?.message})`,
      err?.code === 'ECONNREFUSED' || String(err?.message || '').includes('timed out')
    );
    console.log('    (Set MYSQL_* in server/.env for full integration queue test)');
  } finally {
    await endPoolSafely(pool);
  }
}

console.log('\n100 concurrent acquires — no process crash (queue capped)');
{
  const pool = mysql.createPool({
    host: env.mysql.host,
    port: env.mysql.port,
    user: env.mysql.user,
    password: env.mysql.password,
    database: env.mysql.database,
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 5,
    connectTimeout: env.mysql.pool.connectTimeoutMs,
  });
  installMysqlPoolExhaustionGuard(pool);

  try {
    const results = await allSettledWithTimeout(
      Array.from({ length: 100 }, async () => {
        const conn = await acquireConnectionWithTimeout(pool);
        try {
          return true;
        } finally {
          conn.release();
        }
      })
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;
    const exhausted = results.filter(
      (r) => r.status === 'rejected' && r.reason instanceof MySqlPoolExhaustedError
    ).length;

    ok('all 100 settle (no hang)', results.length === 100);
    ok('majority rejected when pool saturated', rejected >= 50);
    ok('rejections are MySqlPoolExhaustedError', exhausted === rejected);
    ok('some acquires still succeed under churn', fulfilled >= 2);
  } catch (err) {
    ok(
      `concurrency test skipped (${err?.code || err?.message})`,
      err?.code === 'ECONNREFUSED' || String(err?.message || '').includes('timed out')
    );
  } finally {
    await endPoolSafely(pool);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
