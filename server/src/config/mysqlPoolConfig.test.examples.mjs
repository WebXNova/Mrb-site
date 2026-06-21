/**
 * MySQL pool configuration safety tests.
 * Run: npm run test:mysql-pool-config
 */
import {
  collectMysqlPoolSafetyIssues,
  isFinitePoolQueueLimit,
  isPositivePoolTimeoutMs,
  MYSQL_POOL_ENV_KEYS,
  parseMysqlPoolConfigFromEnv,
  validateMysqlPoolConfigAtStartup,
} from './mysqlPoolConfig.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

function expectThrow(fn, messageIncludes) {
  try {
    fn();
    failed += 1;
    console.error(`  ✗ expected throw containing "${messageIncludes}"`);
  } catch (error) {
    assert(String(error.message).includes(messageIncludes), `throws: ${messageIncludes}`);
  }
}

console.log('mysqlPoolConfig tests\n');

console.log('[env parsing defaults]');
const defaults = parseMysqlPoolConfigFromEnv({});
assert(defaults.connectionLimit === 30, 'connectionLimit default 30');
assert(defaults.queueLimit === 100, 'queueLimit default 100');
assert(defaults.acquireTimeoutMs === 10_000, 'acquireTimeoutMs default 10000');
assert(isFinitePoolQueueLimit(defaults.queueLimit), 'default queueLimit is finite');

console.log('\n[env parsing overrides]');
const custom = parseMysqlPoolConfigFromEnv({
  MYSQL_POOL_CONNECTION_LIMIT: '12',
  MYSQL_POOL_QUEUE_LIMIT: '25',
  MYSQL_POOL_ACQUIRE_TIMEOUT: '15000',
});
assert(custom.connectionLimit === 12, 'connectionLimit from env');
assert(custom.queueLimit === 25, 'queueLimit from env');
assert(custom.acquireTimeoutMs === 15_000, 'acquireTimeoutMs from MYSQL_POOL_ACQUIRE_TIMEOUT alias');

console.log('\n[invalid env values throw at parse time]');
expectThrow(
  () => parseMysqlPoolConfigFromEnv({ MYSQL_POOL_QUEUE_LIMIT: '0' }),
  'MYSQL_POOL_QUEUE_LIMIT must be a positive integer'
);
expectThrow(
  () => parseMysqlPoolConfigFromEnv({ MYSQL_POOL_ACQUIRE_TIMEOUT_MS: 'abc' }),
  'MYSQL_POOL_ACQUIRE_TIMEOUT_MS must be a positive integer'
);

console.log('\n[safety issue detection]');
assert(
  collectMysqlPoolSafetyIssues({ connectionLimit: 10, queueLimit: 0, acquireTimeoutMs: 5000 }).includes(
    'queueLimit'
  ),
  'queueLimit 0 flagged unsafe'
);
assert(
  collectMysqlPoolSafetyIssues({ connectionLimit: 10, queueLimit: 5, acquireTimeoutMs: 0 }).includes(
    'acquireTimeoutMs'
  ),
  'acquireTimeoutMs 0 flagged unsafe'
);
assert(collectMysqlPoolSafetyIssues(defaults).length === 0, 'defaults have no safety issues');

console.log('\n[startup validation behavior]');
validateMysqlPoolConfigAtStartup(defaults, { nodeEnv: 'development' });
assert(true, 'development passes with safe defaults');

expectThrow(
  () =>
    validateMysqlPoolConfigAtStartup(
      { connectionLimit: 10, queueLimit: 0, acquireTimeoutMs: 5000 },
      { nodeEnv: 'production' }
    ),
  'queueLimit'
);

console.log('\n[env key documentation]');
assert(
  MYSQL_POOL_ENV_KEYS.queueLimit === 'MYSQL_POOL_QUEUE_LIMIT',
  'queueLimit env key documented'
);
assert(
  MYSQL_POOL_ENV_KEYS.acquireTimeoutMs === 'MYSQL_POOL_ACQUIRE_TIMEOUT_MS',
  'acquireTimeoutMs env key documented'
);
assert(isPositivePoolTimeoutMs(1000), 'positive timeout helper');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
