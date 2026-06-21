/**
 * G-05 — publish idempotency unit tests.
 *
 * Run: node src/services/testPublishIdempotency.test.examples.mjs
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppError } from '../errors/base/AppError.js';
import {
  formatPublishResponse,
  isPublishIdempotentReplay,
  lockTestRowForPublish,
  PUBLISH_IDEMPOTENT_REPLAY_REASON,
} from './testPublishIdempotency.service.js';

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

console.log('testPublishIdempotency — G-05\n');

assert(isPublishIdempotentReplay({ status: 'published' }), 'published status is replay');
assert(isPublishIdempotentReplay({ status: 'PUBLISHED' }), 'PUBLISHED status is replay');
assert(!isPublishIdempotentReplay({ status: 'READY_FOR_PUBLISH' }), 'unpublished status is not replay');
assert(!isPublishIdempotentReplay(null), 'null row is not replay');

{
  const base = { id: 7, title: 'T', status: 'published', publicSlug: 't-7' };
  const replay = formatPublishResponse(base, { idempotentReplay: true });
  assert(replay.publishReplay === true, 'formatPublishResponse sets publishReplay');
  assert(replay.id === 7, 'replay preserves test fields');

  const fresh = formatPublishResponse(base, { idempotentReplay: false });
  assert(fresh.publishReplay === undefined, 'first publish omits publishReplay flag');
}

{
  const connection = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (/FROM tests WHERE id = \? .* FOR UPDATE/i.test(normalized)) {
        return [[{ id: 12, course_id: 1, title: 'Done', status: 'published' }], []];
      }
      throw new Error(`unexpected sql: ${normalized.slice(0, 80)}`);
    },
  };
  const row = await lockTestRowForPublish(connection, 12);
  assert(isPublishIdempotentReplay(row), 'lockTestRowForPublish returns locked row');
}

{
  let notFound = false;
  try {
    await lockTestRowForPublish({ async query() { return [[], []]; } }, 404);
  } catch (error) {
    notFound = error instanceof AppError && error.errorCode === 'NOT_FOUND';
  }
  assert(notFound, 'missing test throws NOT_FOUND');
}

mustContain(
  'src/services/test.service.js',
  ['lockTestRowForPublish', 'isPublishIdempotentReplay', 'formatPublishResponse', 'PUBLISH_IDEMPOTENT_REPLAY_REASON'],
  'publishTest wires idempotency'
);
assert(PUBLISH_IDEMPOTENT_REPLAY_REASON === 'PUBLISH_ALREADY_PUBLISHED', 'replay reason constant');

mustContain(
  'src/routes/admin.routes.js',
  ["router.post('/tests/:testId/publish', testWriteRateLimit, idempotencyMiddleware, postTestPublish)"],
  'publish route uses idempotency middleware'
);

mustContain(
  'src/services/testLifecycle.service.js',
  ["LOWER(TRIM(status)) <> 'published'"],
  'executePublishTestStatus is publish-once safe'
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
