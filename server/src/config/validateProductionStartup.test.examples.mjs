/**
 * Production startup validation tests.
 * Run: node src/config/validateProductionStartup.test.examples.mjs
 */
import {
  collectProductionStartupConfigIssues,
  isProductionNodeEnv,
  isTrustProxyConfigured,
  validateProductionStartupConfig,
} from './validateProductionStartup.js';

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

console.log('validateProductionStartup tests\n');

console.log('[development skips validation]');
assert(!isProductionNodeEnv('development'), 'development is not production');
validateProductionStartupConfig({ nodeEnv: 'development', processEnv: {} });
assert(true, 'development startup validation is no-op');

console.log('\n[production missing keys]');
const missingIssues = collectProductionStartupConfigIssues({});
assert(
  missingIssues.includes('REDIS_URL') &&
    missingIssues.includes('SAFEPAY_WEBHOOK_SECRET') &&
    missingIssues.includes('JWT_ACCESS_SECRET') &&
    missingIssues.includes('JWT_REFRESH_SECRET') &&
    missingIssues.includes('TRUST_PROXY'),
  'collects all required production keys'
);
expectThrow(
  () => validateProductionStartupConfig({ nodeEnv: 'production', processEnv: {} }),
  'REDIS_URL'
);

console.log('\n[production valid config]');
const validEnv = {
  NODE_ENV: 'production',
  REDIS_URL: 'redis://127.0.0.1:6379',
  SAFEPAY_WEBHOOK_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  JWT_ACCESS_SECRET: '01234567890123456789012345678901',
  JWT_REFRESH_SECRET: '09876543210987654321098765432109',
  TRUST_PROXY: '1',
};
assert(collectProductionStartupConfigIssues(validEnv).length === 0, 'valid env has no issues');
validateProductionStartupConfig({ nodeEnv: 'production', processEnv: validEnv });
assert(true, 'valid production config passes');

console.log('\n[TRUST_PROXY rules]');
assert(!isTrustProxyConfigured(undefined), 'unset TRUST_PROXY is invalid');
assert(!isTrustProxyConfigured('false'), 'false TRUST_PROXY is invalid');
assert(isTrustProxyConfigured('true'), 'true TRUST_PROXY is valid');
assert(isTrustProxyConfigured('1'), 'numeric TRUST_PROXY is valid');

console.log('\n[production redis fail-closed]');
const redisDisabledEnv = {
  ...validEnv,
  REQUIRE_REDIS_IN_PRODUCTION: 'false',
};
assert(
  collectProductionStartupConfigIssues(redisDisabledEnv).some((issue) =>
    issue.includes('REQUIRE_REDIS_IN_PRODUCTION')
  ),
  'REQUIRE_REDIS_IN_PRODUCTION=false is blocked in production'
);
expectThrow(
  () => validateProductionStartupConfig({ nodeEnv: 'production', processEnv: redisDisabledEnv }),
  'REQUIRE_REDIS_IN_PRODUCTION'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
