/**
 * G-RT-05 static verification — shuffle delivery layout wired across runtime.
 * Run: node scripts/verify-test-delivery-layout.mjs
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

console.log('G-RT-05 — attempt delivery layout verification\n');

assertMatch(
  'delivery layout service',
  read('src/services/attemptDeliveryLayout.service.js'),
  /export async function initializeAttemptDeliveryLayout/
);

assertMatch(
  'schema delivery_layout_json',
  read('src/sql/schema.sql'),
  /delivery_layout_json/
);

assertMatch(
  'slug create initializes layout',
  read('src/services/testAttempt.service.js'),
  /initializeAttemptDeliveryLayout/
);

assertMatch(
  'slug load uses attempt layout',
  read('src/services/testAttempt.service.js'),
  /loadComposedQuestionsWithAttemptLayout/
);

assertMatch(
  'slug submit grades with layout',
  read('src/services/testAttempt.service.js'),
  /loadComposedQuestionsWithAttemptLayout/
);

assertMatch(
  'portal start initializes layout',
  read('src/services/studentTestStart.service.js'),
  /initializeAttemptDeliveryLayout/
);

assertMatch(
  'portal load uses attempt layout',
  read('src/services/studentAttemptLoad.service.js'),
  /loadComposedQuestionsWithAttemptLayout/
);

assertMatch(
  'secure context loads shuffle flags',
  read('src/services/testAttempt/secureAttemptContext.js'),
  /shuffle_questions/
);

assertMatch(
  'answers still keyed by option id',
  read('src/services/testAttempt/gradeComposedAttempt.js'),
  /selectedOptionId/
);

console.log('\nAll G-RT-05 delivery layout checks passed.');
