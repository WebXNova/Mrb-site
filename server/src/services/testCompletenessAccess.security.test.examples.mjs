/**
 * G-06 — completeness endpoint IDOR / ownership security tests.
 *
 * Run: npm run test:completeness-access-security
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppError } from '../errors/base/AppError.js';
import {
  assertTestCompletenessAccess,
  assertTestMutationAccess,
} from './testMutationAccess.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..', '..');

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

function mustContain(fileRel, needles, label) {
  const filePath = path.join(serverRoot, fileRel);
  assert(existsSync(filePath), `file exists: ${fileRel}`);
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    assert(text.includes(needle), `${label}: "${needle}"`);
  }
}

/**
 * @param {{ id: number, created_by: number|null, course_id?: number, status?: string, title?: string }} row
 */
function createMockExecutor(row) {
  return {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (/FROM tests WHERE id = \?/i.test(normalized)) {
        return row ? [[row], []] : [[], []];
      }
      throw new Error(`Unhandled SQL: ${normalized.slice(0, 80)}`);
    },
  };
}

console.log('testCompletenessAccess — G-06 security\n');

{
  const executor = createMockExecutor({
    id: 10,
    created_by: 5,
    course_id: 1,
    status: 'DRAFT',
    title: 'Owned',
  });
  const row = await assertTestCompletenessAccess(10, 5, 'admin', { executor });
  assert(Number(row.id) === 10, 'owner admin can read completeness');
}

{
  let denied = false;
  try {
    await assertTestCompletenessAccess(
      10,
      99,
      'admin',
      {
        executor: createMockExecutor({
          id: 10,
          created_by: 5,
          course_id: 1,
          status: 'DRAFT',
          title: 'Foreign',
        }),
      }
    );
  } catch (error) {
    denied = error instanceof AppError && error.errorCode === 'FORBIDDEN';
  }
  assert(denied, 'non-owner admin denied completeness (IDOR blocked)');
}

{
  const executor = createMockExecutor({
    id: 11,
    created_by: 7,
    course_id: 2,
    status: 'DRAFT',
    title: 'Super',
  });
  const row = await assertTestCompletenessAccess(11, 99, 'super_admin', { executor });
  assert(Number(row.id) === 11, 'super_admin can read any completeness');
}

{
  let notFound = false;
  try {
    await assertTestCompletenessAccess(404, 5, 'admin', {
      executor: createMockExecutor(null),
    });
  } catch (error) {
    notFound = error instanceof AppError && error.errorCode === 'NOT_FOUND';
  }
  assert(notFound, 'missing test returns NOT_FOUND without disclosure');
}

{
  const publishFn = assertTestMutationAccess.toString();
  const completenessFn = assertTestCompletenessAccess.toString();
  assert(
    completenessFn.includes('assertTestMutationAccess'),
    'completeness access delegates to publish mutation gate'
  );
  assert(publishFn.includes('TEST_MUTATION_OWNERSHIP_DENIED'), 'mutation gate logs ownership denial');
}

mustContain(
  'src/controllers/tests.controller.js',
  ['assertTestCompletenessAccess', 'getTestCompleteness(testId, {'],
  'completeness handler enforces access'
);

mustContain(
  'src/services/test.service.js',
  ['assertTestCompletenessAccess', 'getTestCompleteness(testId, access = {})'],
  'completeness service defense in depth'
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
