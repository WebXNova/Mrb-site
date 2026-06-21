/**
 * Static verification for read-only Result API (no DB).
 * Run: node src/result/result.service.test.examples.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getResultSummary } from './result.service.js';

const root = path.dirname(fileURLToPath(import.meta.url));

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

console.log('resultApi — static verification\n');

const serviceSrc = fs.readFileSync(path.join(root, 'result.service.js'), 'utf8');
const repoSrc = fs.readFileSync(path.join(root, 'result.repository.js'), 'utf8');

ok('service is read-only (no INSERT/UPDATE/DELETE)', !/INSERT INTO|UPDATE |DELETE FROM/i.test(serviceSrc));
ok('reads from test_results', repoSrc.includes('test_results'));
ok('batch detailed query (no per-question loop query)', repoSrc.includes('LOAD_DETAILED_ANSWERS_SQL'));
ok('no grading logic in service', !serviceSrc.includes('calculateResult'));
ok('checks show_result_immediately', serviceSrc.includes('assertStudentResultVisible'));
ok('checks show_answers_after_submit', serviceSrc.includes('loadSanitizedPortalAnswerReview'));
ok('checks show_explanations', serviceSrc.includes('isShowExplanationsEnabled'));

{
  const summary = getResultSummary({
    score: 18,
    percentage: 90,
    pass_status: 'PASS',
    correct_answers: 18,
    wrong_answers: 2,
    unanswered_answers: 0,
    time_taken_seconds: 1440,
  });

  ok('summary maps test_results fields', summary.score === 18 && summary.status === 'PASS');
  ok('summary exposes unanswered_answers', summary.unanswered_answers === 0);
}

{
  const summary = getResultSummary({
    started_at: '2026-06-19 10:38:00',
    submitted_at: '2026-06-19 15:46:00',
    time_taken_seconds: 119,
    score: 6,
    percentage: 60,
    pass_status: 'PASS',
    correct_answers: 6,
    wrong_answers: 4,
    unanswered_answers: 0,
  });

  ok('summary prefers persisted time_taken_seconds', summary.time_taken_seconds === 119);
}

const routesSrc = fs.readFileSync(path.join(root, 'result.routes.js'), 'utf8');
ok('GET result route registered', routesSrc.includes('/:attempt_id/result'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
