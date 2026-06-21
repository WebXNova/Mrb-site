/**
 * Teacher thread secret — security acceptance tests.
 *
 * Run: npm run test:teacher-thread-secret-security
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  validateHmacSecretValue,
  loadTeacherThreadSecrets,
  resetTeacherThreadSecretsForTests,
  TEACHER_THREAD_SECRET_REQUIREMENTS,
} from '../security/teacherThreadSecret.js';
import { buildTeacherQuestionThreadIdWithSecret } from '../services/teacherQuestionThreadRef.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..', '..');

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

function mustContain(fileRel, needles, label) {
  const filePath = path.join(serverRoot, fileRel);
  ok(`exists: ${fileRel}`, existsSync(filePath));
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label}: "${needle}"`, text.includes(needle));
  }
}

function mustNotContain(fileRel, needles, label) {
  const filePath = path.join(serverRoot, fileRel);
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label} absent: "${needle}"`, !text.includes(needle));
  }
}

console.log('teacherThreadSecret — acceptance tests\n');

const STRONG_SECRET = 'a8f3k9m2p7q1w4e6r0t5y8u3i6o9p2l5z8x1c4v7b0n3m6';

{
  ok('min length requirement', TEACHER_THREAD_SECRET_REQUIREMENTS.minLength >= 32);
  ok('accepts strong secret', validateHmacSecretValue('TEST', STRONG_SECRET) === STRONG_SECRET);
  try {
    validateHmacSecretValue('TEST', 'short');
    ok('rejects short secret', false);
  } catch {
    ok('rejects short secret', true);
  }
  try {
    validateHmacSecretValue('TEST', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    ok('rejects low entropy', false);
  } catch {
    ok('rejects low entropy', true);
  }
  try {
    validateHmacSecretValue('TEST', 'changeme_abcdefghijklmnopqrstuvwxyz12');
    ok('rejects placeholder', false);
  } catch {
    ok('rejects placeholder', true);
  }
}

{
  const prev = process.env.TEACHER_THREAD_SECRET;
  const prevList = process.env.TEACHER_THREAD_PREVIOUS_SECRETS;
  process.env.TEACHER_THREAD_SECRET = STRONG_SECRET;
  process.env.TEACHER_THREAD_PREVIOUS_SECRETS = `${STRONG_SECRET}x9z2,${STRONG_SECRET}y7w1`;
  resetTeacherThreadSecretsForTests();
  const loaded = loadTeacherThreadSecrets();
  ok('loads current + previous', loaded.all.length === 3);
  ok('current is first in all', loaded.all[0] === STRONG_SECRET);
  process.env.TEACHER_THREAD_SECRET = prev;
  process.env.TEACHER_THREAD_PREVIOUS_SECRETS = prevList;
  resetTeacherThreadSecretsForTests();
}

{
  const a = buildTeacherQuestionThreadIdWithSecret(1, 2, STRONG_SECRET);
  const b = buildTeacherQuestionThreadIdWithSecret(1, 2, `${STRONG_SECRET}x9z2`);
  ok('different secrets produce different thread ids', a && b && a !== b);
  ok('thread id length', String(a).length === 22);
}

mustNotContain(
  'src/services/teacherQuestionThreadRef.js',
  ['SESSION_SECRET', 'mrb-teacher-thread-dev-only', 'process.env.TEACHER_THREAD_SECRET ||'],
  'no insecure fallbacks in threadRef'
);

mustContain(
  'src/security/teacherThreadSecret.js',
  ['validateTeacherThreadSecretAtStartup', 'MIN_SECRET_LENGTH', 'MIN_UNIQUE_CHARS', 'TEACHER_THREAD_PREVIOUS_SECRETS'],
  'secret validation module'
);

mustContain(
  'src/server.js',
  ['validateTeacherThreadSecretAtStartup', 'TEACHER_THREAD_SECRET validated'],
  'startup validation wired'
);

mustContain(
  'src/services/teacherQuestionThreadRef.js',
  ['getTeacherThreadSecrets', 'buildTeacherQuestionThreadIdWithSecret', 'resolveTeacherQuestionThreadId'],
  'rotation-aware thread ref'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
