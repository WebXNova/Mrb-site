/**
 * Teacher upload rate limiting — security acceptance tests.
 *
 * Run: npm run test:teacher-upload-rate-limit-security
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  checkSlidingWindowLimit,
  resetSlidingWindowMemoryForTests,
} from '../services/slidingWindowRateLimit.service.js';
import { getTeacherUploadRateLimitConfig } from '../config/teacherUploadRateLimit.config.js';

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

console.log('teacherUploadRateLimit — acceptance tests\n');

{
  resetSlidingWindowMemoryForTests();
  const key = 'test:teacher-upload:burst';
  const r1 = await checkSlidingWindowLimit(key, 60_000, 3);
  const r2 = await checkSlidingWindowLimit(key, 60_000, 3);
  const r3 = await checkSlidingWindowLimit(key, 60_000, 3);
  const r4 = await checkSlidingWindowLimit(key, 60_000, 3);
  ok('allows within limit', r1.allowed && r2.allowed && r3.allowed);
  ok('blocks over limit', r4.allowed === false);
  ok('retryAfter on block', r4.retryAfterMs > 0);
}

{
  const config = getTeacherUploadRateLimitConfig();
  ok('image burst session configured', config.image.burstSessionPerMinute >= 1);
  ok('audio stricter than image hourly', config.audio.teacherPerHour < config.image.teacherPerHour);
  ok('audio daily cap exists', config.audio.teacherPerDay > 0);
  ok('image daily cap exists', config.image.teacherPerDay > 0);
}

mustContain(
  'src/middleware/teacherUploadRateLimit.js',
  [
    'checkSlidingWindowLimit',
    'writeQaAuditEventFromReq',
    'teacher.question.upload.rate_limit',
    'requireRedisForTeacherUploads',
    'teacherImageUploadRateLimits',
    'teacherAudioUploadRateLimits',
    'burst_session',
    'teacher_day',
    'ip_day',
    'RATE_LIMITED',
  ],
  'upload rate limit middleware'
);

mustContain(
  'src/routes/teacher.routes.js',
  ['teacherImageUploadRateLimits', 'teacherAudioUploadRateLimits', 'answer/attachment', 'answer/recording'],
  'teacher routes wired'
);

mustContain(
  'src/services/slidingWindowRateLimit.service.js',
  ['getRedisClient', 'incr', 'pExpire'],
  'redis sliding window'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
