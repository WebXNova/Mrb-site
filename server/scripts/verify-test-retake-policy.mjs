/**
 * G-RT-04 static verification — retake policy wired across runtime.
 * Run: node scripts/verify-test-retake-policy.mjs
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

console.log('G-RT-04 — test retake policy verification\n');

assertMatch(
  'retake policy service',
  read('src/services/testRetakePolicy.service.js'),
  /export function assertCanCreateNewTestAttempt/
);

assertMatch(
  'slug create uses assertCanCreateNewTestAttempt',
  read('src/services/testAttempt.service.js'),
  /assertCanCreateNewTestAttempt/
);

assertMatch(
  'slug INSERT SQL retake guard',
  read('src/services/testAttempt.queries.js'),
  /TEST_RETAKE_CREATE_WHERE_SQL/
);

assertMatch(
  'portal start retake guard',
  read('src/services/studentTestStart.service.js'),
  /assertCanCreateNewTestAttempt/
);

assertMatch(
  'prep exposes retakePolicy',
  read('src/services/testInstructionsPrep.service.js'),
  /retakePolicy:/
);

assertMatch(
  'listing query loads allow_retake',
  read('src/services/studentTestListing.queries.js'),
  /allow_retake/
);

assertMatch(
  'client retake UI message',
  read('../client/src/features/test-instructions/components/AttemptInfoCard.jsx'),
  /RETAKE_NOT_ALLOWED/
);

console.log('\nAll G-RT-04 retake policy checks passed.');
