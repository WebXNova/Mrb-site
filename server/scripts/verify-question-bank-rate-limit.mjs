/**
 * Question Bank write rate limit — wiring + policy checks.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(condition, message) {
  if (!condition) throw new Error(`[verify-question-bank-rate-limit] ${message}`);
}

function read(rel) {
  const p = path.join(root, rel);
  if (!existsSync(p)) throw new Error(`[verify-question-bank-rate-limit] missing ${rel}`);
  return readFileSync(p, 'utf8');
}

function testRouteWiring() {
  const routes = read('src/routes/questions.routes.js');

  assert(routes.includes('questionBankWriteRateLimit'), 'questions.routes must import write rate limiter');
  assert(
    /router\.post\('\/',\s*questionBankWriteRateLimit,\s*postQuestion\)/.test(routes),
    'POST / must use questionBankWriteRateLimit before handler'
  );
  assert(
    /router\.put\('\/:id',\s*questionBankWriteRateLimit,\s*putQuestion\)/.test(routes),
    'PUT /:id must use questionBankWriteRateLimit before handler'
  );
  assert(
    /router\.delete\('\/:id',\s*questionBankWriteRateLimit,\s*deleteQuestion\)/.test(routes),
    'DELETE /:id must use questionBankWriteRateLimit before handler'
  );
  assert(
    /router\.get\('\/',\s*getQuestions\)/.test(routes) && !routes.includes("router.get('/', questionBankWriteRateLimit"),
    'GET / must not use write rate limiter'
  );
  assert(
    /router\.get\('\/:id',\s*getQuestion\)/.test(routes) && !routes.includes("router.get('/:id', questionBankWriteRateLimit"),
    'GET /:id must not use write rate limiter'
  );
}

function testLimiterImplementation() {
  const limiter = read('src/middleware/questionBankWriteRateLimit.js');

  assert(limiter.includes('express-rate-limit'), 'must use express-rate-limit');
  assert(limiter.includes('questionBankWriteRateLimit'), 'must export write limiter');
  assert(limiter.includes('questionBankImportRateLimit'), 'must export separate import limiter for future routes');
  assert(limiter.includes('admin.question.rate_limit'), 'must audit log rate limit abuse');
  assert(limiter.includes('QUESTION_BANK_RATE_LIMITED'), 'audit metadata must include event name');
  assert(limiter.includes("code: 'RATE_LIMITED'"), '429 must use RATE_LIMITED code');
  assert(limiter.includes('Retry-After'), '429 must set Retry-After header');
  assert(limiter.includes('question-bank:${bucket}') || limiter.includes('`question-bank:${'), 'write/import buckets use distinct key prefix');
  assert(limiter.includes("limitType: 'write'"), 'write limiter uses write bucket');
  assert(limiter.includes("limitType: 'import'"), 'import limiter uses separate import bucket');
}

try {
  testRouteWiring();
  testLimiterImplementation();
  console.log('verify-question-bank-rate-limit: OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
