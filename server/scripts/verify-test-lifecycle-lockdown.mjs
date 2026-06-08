/**
 * P0 PATCH-2 — lifecycle lockdown static verification.
 * Run: node scripts/verify-test-lifecycle-lockdown.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  LIFECYCLE_FORBIDDEN_BODY_KEYS,
  rejectLifecycleFieldsInBody,
} from '../src/services/testLifecycle.service.js';
import { isPublishDbStatusValue } from '../src/services/testCompleteness.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(serverRoot, rel), 'utf8');
}

function assertNoMatch(label, content, pattern) {
  if (pattern.test(content)) throw new Error(`${label}: forbidden pattern ${pattern}`);
  console.log(`PASS ${label}`);
}

function assertMatch(label, content, pattern) {
  if (!pattern.test(content)) throw new Error(`${label}: missing pattern ${pattern}`);
  console.log(`PASS ${label}`);
}

const controller = read('src/controllers/tests.controller.js');
const testService = read('src/services/test.service.js');
const lifecycle = read('src/services/testLifecycle.service.js');
const linkService = read('src/services/testQuestionLink.service.js');
const adminApi = read('../client/src/api/adminApi.js');
const adminTestsPage = read('../client/src/admin/pages/AdminTestsPage.jsx');

assertMatch('controller — legacy 410', controller, /LEGACY_ENDPOINT_DISABLED/);
assertMatch('controller — patch basic-info', controller, /patchTestBasicInfo/);
assertMatch('controller — reject lifecycle in wizard', controller, /rejectLifecycleFieldsInBody/);
assertNoMatch('controller — legacy updateTest import', controller, /\bupdateTest,/);

assertNoMatch('test.service — legacy updateTest function', testService, /export async function updateTest\(/);
assertMatch('test.service — publish uses eligibility engine', testService, /validatePublishEligibility/);
assertMatch('test.service — publish sync before commit', testService, /syncTestLifecycleStatus/);
assertMatch('test.service — executePublishTestStatus', testService, /executePublishTestStatus/);
assertNoMatch('test.service — direct publish SQL', testService, /SET status = 'published'/);

assertMatch('lifecycle — only publish executor', lifecycle, /executePublishTestStatus/);
assertMatch('link service — mutation guard', linkService, /enforceQuestionMutationPreconditions/);

assertNoMatch('adminApi — updateTest', adminApi, /updateTest:/);
assertMatch('adminApi — patchTestBasicInfo', adminApi, /patchTestBasicInfo/);
assertMatch('adminApi — post publish', adminApi, /post\(`\/admin\/tests\/\$\{testId\}\/publish`/);
assertMatch('controller — putTestPublish 410', controller, /putTestPublish[\s\S]*410/);

assertNoMatch('AdminTestsPage — updateTest call', adminTestsPage, /adminApi\.updateTest/);
assertNoMatch('AdminTestsPage — status in form', adminTestsPage, /status:/);

// Case 1 & 2 — lifecycle field rejection
let rejected = false;
try {
  rejectLifecycleFieldsInBody({ status: 'published' });
} catch (e) {
  rejected = true;
  if (e.errorCode !== 'VALIDATION_ERROR') throw new Error('Case 1: wrong error code');
}
if (!rejected) throw new Error('Case 1 failed: status publish should be rejected');
console.log('PASS Case 1 — status published rejected in body');

rejected = false;
try {
  rejectLifecycleFieldsInBody({ lifecycle_status: 'READY_FOR_PUBLISH' });
} catch {
  rejected = true;
}
if (!rejected) throw new Error('Case 2 failed: lifecycle_status rejected');
console.log('PASS Case 2 — lifecycle_status rejected');

if (!LIFECYCLE_FORBIDDEN_BODY_KEYS.includes('status')) {
  throw new Error('forbidden keys must include status');
}
console.log('PASS forbidden keys list');

if (!isPublishDbStatusValue('published')) throw new Error('isPublishDbStatusValue');
console.log('PASS publish status detector');

console.log('Test lifecycle lockdown verification complete.');
