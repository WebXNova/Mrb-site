/**
 * Structured LMS action logger unit tests.
 *
 * Run: npm run test:lms-action-logger
 */
import { LMS_ACTION_EVENTS } from './lmsActionEvents.js';
import { lmsActionLogger, logImportStarted, logTestCreated } from './lmsActionLogger.service.js';

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

const originalInfo = console.info;
const originalError = console.error;
/** @type {string[]} */
const lines = [];

console.info = (...args) => {
  lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
};
console.error = (...args) => {
  lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
};

try {
  console.log('lmsActionLogger — structured LMS events\n');

  process.env.LMS_ACTION_DB_PERSIST = 'false';

  logImportStarted({
    userId: 42,
    batchId: 99,
    entityId: 99,
    courseId: 7,
  });

  assert(lines.length === 1, 'emits one log line');
  const entry = JSON.parse(lines[0]);
  assert(entry.event === LMS_ACTION_EVENTS.IMPORT_STARTED, 'IMPORT_STARTED event');
  assert(entry.userId === 42, 'includes userId');
  assert(entry.entityId === '99', 'includes entityId');
  assert(typeof entry.timestamp === 'string', 'includes timestamp');
  assert(entry.service === 'lms', 'includes service tag');
  assert(entry.level === 'info', 'info level');

  lines.length = 0;
  logTestCreated({
    userId: 3,
    testId: 15,
    entityId: 15,
    courseId: 2,
  });
  const created = JSON.parse(lines[0]);
  assert(created.event === LMS_ACTION_EVENTS.TEST_CREATED, 'TEST_CREATED event');
  assert(created.entityId === '15', 'entityId from testId');

  lines.length = 0;
  lmsActionLogger.error({
    event: LMS_ACTION_EVENTS.IMPORT_FAILED,
    userId: 1,
    batchId: 2,
    entityId: 2,
    message: 'parse error',
  });
  const failedEntry = JSON.parse(lines[0]);
  assert(failedEntry.level === 'error', 'error level uses console.error');
  assert(failedEntry.event === LMS_ACTION_EVENTS.IMPORT_FAILED, 'IMPORT_FAILED event');
} finally {
  console.info = originalInfo;
  console.error = originalError;
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
