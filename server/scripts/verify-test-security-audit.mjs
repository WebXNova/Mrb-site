/**
 * P2 PATCH-8/9 — test mutation authority + security audit verification.
 * Run: node scripts/verify-test-security-audit.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppError } from '../src/errors/base/AppError.js';
import {
  logSecurityEvent,
  TEST_SECURITY_ACTIONS,
} from '../src/services/testSecurityAudit.service.js';
import { parseStrictTestType } from '../src/validators/testEnumGuards.js';
import { throwFromValidationReport, buildValidationReport } from '../src/services/testValidation.service.js';
import { INVALID_TEST_TYPE, TEST_IS_LOCKED } from '../src/errors/codes/ErrorCodes.js';
import { rejectLifecycleFieldsInBody } from '../src/services/testLifecycle.service.js';
import { createTest } from '../src/services/test.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(serverRoot, rel), 'utf8');
}

function assertMatch(label, content, pattern) {
  if (!pattern.test(content)) throw new Error(`${label}: missing ${pattern}`);
  console.log(`PASS ${label}`);
}

const routes = read('src/routes/admin.routes.js');
const controller = read('src/controllers/tests.controller.js');
const audit = read('src/services/testSecurityAudit.service.js');
const testService = read('src/services/test.service.js');

assertMatch('routes — POST tests', routes, /router\.post\('\/tests', testWriteRateLimit, postTest\)/);
assertMatch('routes — PATCH basic-info', routes, /router\.patch\('\/tests\/:testId\/basic-info'/);
assertMatch('routes — POST publish', routes, /router\.post\('\/tests\/:testId\/publish'/);
assertMatch('audit service — logSecurityEvent', audit, /export function logSecurityEvent/);
assertMatch('audit — PUBLISH_ATTEMPT', audit, /PUBLISH_ATTEMPT/);
assertMatch('audit — LEGACY_ENDPOINT_ACCESS', audit, /LEGACY_ENDPOINT_ACCESS/);
assertMatch('controller — publish audit', controller, /PUBLISH_ATTEMPT/);
assertMatch('controller — putTest 410', controller, /LEGACY_ENDPOINT_ACCESS[\s\S]*putTest/s);
assertMatch('controller — putTestPublish 410', controller, /putTestPublish[\s\S]*410/);
assertMatch('test.service — createTest disabled', testService, /createTest_service_deprecated/);
assertMatch('validation — throwFromValidationReport audit', read('src/services/testValidation.service.js'), /logTestValidationFailure/);

// Case — logSecurityEvent returns record
const record = logSecurityEvent({
  action: TEST_SECURITY_ACTIONS.VALIDATION_FAILURE,
  testId: 1,
  userId: 2,
  reason: 'unit_test',
  metadata: { password: 'secret', token: 'abc' },
});
if (!record.action) throw new Error('logSecurityEvent should return audit record');
console.log('PASS Case — logSecurityEvent emits record');

// Case — enum guard logs and rejects
let rejected = false;
try {
  parseStrictTestType('invalid_test_type');
} catch (e) {
  rejected = e instanceof AppError && e.errorCode === 'INVALID_TEST_TYPE';
}
if (!rejected) throw new Error('enum guard should reject');
console.log('PASS Case — unknown enum rejected');

// Case — validation failure logs
rejected = false;
try {
  throwFromValidationReport(buildValidationReport(false, [INVALID_TEST_TYPE], { testId: 9 }), INVALID_TEST_TYPE, {
    testId: 9,
  });
} catch (e) {
  rejected = e instanceof AppError;
}
if (!rejected) throw new Error('throwFromValidationReport should throw');
console.log('PASS Case — validation failure throws');

// Case — lifecycle violation
rejected = false;
try {
  rejectLifecycleFieldsInBody({ status: 'published' }, { testId: 3, userId: 1 });
} catch (e) {
  rejected = e instanceof AppError;
}
if (!rejected) throw new Error('lifecycle body should reject');
console.log('PASS Case — lifecycle violation');

// Case — legacy createTest service
rejected = false;
try {
  await createTest({ title: 'x' });
} catch (e) {
  rejected = e instanceof AppError && e.errorCode === 'LEGACY_ENDPOINT_DISABLED';
}
if (!rejected) throw new Error('createTest should be disabled');
console.log('PASS Case — legacy createTest disabled');

// Case — published edit audit path exists
if (!audit.includes('PUBLISHED_TEST_EDIT_ATTEMPT')) throw new Error('missing published edit action');
console.log('PASS Case — published mutation audit defined');

console.log('Test security audit verification complete.');
