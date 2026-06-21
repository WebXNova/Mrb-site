/**
 * G-RT-07 static verification — result visibility enforced across runtimes.
 * Run: node scripts/verify-test-result-visibility.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(serverRoot, rel), 'utf8');
}

function ok(label) {
  console.log(`PASS ${label}`);
}

function assertMatch(label, content, pattern) {
  if (!pattern.test(content)) {
    throw new Error(`${label}: missing ${pattern}`);
  }
  ok(label);
}

console.log('G-RT-07 — test result visibility verification\n');

assertMatch(
  'central visibility service',
  read('src/services/testResultVisibility.service.js'),
  /export function assertStudentResultVisible/
);

assertMatch(
  'portal result API uses visibility service',
  read('src/result/result.service.js'),
  /assertStudentResultVisible/
);

assertMatch(
  'slug result enforces visibility',
  read('src/services/testAttempt.service.js'),
  /assertStudentResultVisible/
);

assertMatch(
  'slug result sanitizes grading details',
  read('src/services/testAttempt.service.js'),
  /sanitizeGradingDetailItems/
);

assertMatch(
  'portal detail delegates to result service',
  read('src/services/studentPortal.service.js'),
  /fetchAuthorizedResult/
);

assertMatch(
  'dashboard redacts withheld scores',
  read('src/services/studentPortal.service.js'),
  /redactStudentResultListItem/
);

assertMatch(
  'history respects show_result_immediately',
  read('src/services/studentTestHistory.service.js'),
  /show_result_immediately/
);

assertMatch(
  'student DTO strips isCorrect on delivery',
  read('src/dto/testQuestion.dto.js'),
  /toTestQuestionOptionStudentDto/
);

  assertMatch(
    'client dashboard respects resultAvailable',
    read('../client/src/pages/StudentPortalPage.jsx'),
    /resultAvailable/
  );

  console.log('\nAll G-RT-07 result visibility checks passed.');
