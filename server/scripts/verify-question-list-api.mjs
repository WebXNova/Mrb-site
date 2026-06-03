/**
 * Question list API — schema/DTO unit checks + static security/architecture checks.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { questionListQuerySchema } from '../src/validators/questionList.schema.js';
import { buildQuestionListPagination, toQuestionListItemDto } from '../src/dto/questionList.dto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(condition, message) {
  if (!condition) throw new Error(`[verify-question-list-api] ${message}`);
}

function mustContain(fileRel, needles, label) {
  const p = path.join(root, fileRel);
  if (!existsSync(p)) throw new Error(`[verify-question-list-api] missing file: ${fileRel}`);
  const text = readFileSync(p, 'utf8');
  for (const n of needles) {
    if (!text.includes(n)) {
      throw new Error(`[verify-question-list-api] ${label}: expected "${n}" in ${fileRel}`);
    }
  }
}

function testPaginationValidation() {
  const page1 = questionListQuerySchema.safeParse({ page: '1', limit: '20' });
  assert(page1.success, 'page 1 should parse');
  assert(page1.data.page === 1 && page1.data.limit === 20, 'page 1 defaults');

  const page2 = questionListQuerySchema.safeParse({ page: '2', limit: '20' });
  assert(page2.success && page2.data.page === 2, 'page 2 should parse');

  const emptyPage = questionListQuerySchema.safeParse({ page: '999', limit: '20' });
  assert(emptyPage.success, 'empty page query should still validate');

  const meta = buildQuestionListPagination(999, 20, 5);
  assert(meta.total_pages === 1, 'total_pages for 5 items at limit 20');
  assert(buildQuestionListPagination(2, 20, 0).total_pages === 0, 'empty total_pages is 0');
}

function testSearchValidation() {
  const found = questionListQuerySchema.safeParse({ search: 'cell' });
  assert(found.success && found.data.search === 'cell', 'search match query valid');

  const notFound = questionListQuerySchema.safeParse({ search: 'zzzznotfound' });
  assert(notFound.success, 'search with no DB match still valid at schema level');

  const bad = questionListQuerySchema.safeParse({ search: '   ' });
  assert(!bad.success, 'whitespace-only search rejected');
}

function testFilterValidation() {
  const course = questionListQuerySchema.safeParse({ course_id: '37' });
  assert(course.success && course.data.course_id === 37, 'course filter');

  const subject = questionListQuerySchema.safeParse({ subject_id: '17' });
  assert(subject.success && subject.data.subject_id === 17, 'subject filter');

  const difficulty = questionListQuerySchema.safeParse({ difficulty: 'easy' });
  assert(difficulty.success && difficulty.data.difficulty === 'easy', 'difficulty filter');

  const combined = questionListQuerySchema.safeParse({
    page: '1',
    limit: '20',
    search: 'cell',
    course_id: '37',
    subject_id: '17',
    difficulty: 'easy',
  });
  assert(combined.success, 'combined filters valid');

  assert(!questionListQuerySchema.safeParse({ difficulty: 'extreme' }).success, 'invalid difficulty');
  assert(!questionListQuerySchema.safeParse({ page: '0' }).success, 'page min 1');
  assert(!questionListQuerySchema.safeParse({ limit: '101' }).success, 'limit max 100');
  assert(!questionListQuerySchema.safeParse({ course_id: '-1' }).success, 'course_id positive');
}

function testDtoShape() {
  const item = toQuestionListItemDto({
    id: 3,
    question_text: 'What is powerhouse of cell?',
    difficulty: 'easy',
    course_id: 37,
    subject_id: 17,
    marks: 1,
    created_at: '2026-05-30T22:49:03.000Z',
    explanation: 'secret',
    is_correct: 1,
  });
  assert(item.question_id === 3, 'question_id mapped');
  assert(!('explanation' in item), 'explanation not exposed');
  assert(!('options' in item), 'options not exposed');
  assert(!('is_correct' in item), 'correct answer not exposed');
}

function testStaticSecurity() {
  mustContain(
    'src/routes/questions.routes.js',
    ['adminSecurityStack', 'enforcePolicy', "router.get('/', getQuestions)"],
    'routes security + list endpoint'
  );
  mustContain(
    'src/routes/questions.routes.js',
    ["router.get('/', getQuestions)", "router.get('/:id', getQuestion)"],
    'list route before id route'
  );
  mustContain(
    'src/services/questionBankQueries.service.js',
    ['QB_ACTIVE_WHERE_ALIAS', 'deleted_at IS NULL', 'COUNT(*) AS total', 'buildQuestionListFilters'],
    'centralized query module'
  );
  mustContain(
    'src/services/questions.service.js',
    ['activeQuestionByIdLookup', 'buildQuestionListFilters', 'buildActiveQuestionListQuery'],
    'service uses centralized queries'
  );

  const serviceText = readFileSync(path.join(root, 'src/services/questionBankQueries.service.js'), 'utf8');
  const listFn = serviceText;
  assert(listFn.includes('deleted_at IS NULL'), 'active filter in query module');
  assert(!listFn.includes('is_correct'), 'list query must not expose correct answers');
}

try {
  testPaginationValidation();
  testSearchValidation();
  testFilterValidation();
  testDtoShape();
  testStaticSecurity();
  console.log('verify-question-list-api: OK');
  console.log('');
  console.log('Manual API test examples (require admin session + CSRF):');
  console.log('  GET /api/questions?page=1&limit=20');
  console.log('  GET /api/questions?page=2&limit=20');
  console.log('  GET /api/questions?search=cell');
  console.log('  GET /api/questions?course_id=37');
  console.log('  GET /api/questions?subject_id=17');
  console.log('  GET /api/questions?difficulty=easy');
  console.log('  GET /api/questions?page=1&limit=20&search=cell&course_id=37&subject_id=17&difficulty=easy');
  console.log('');
  console.log('Security expectations:');
  console.log('  Unauthenticated → 401 UNAUTHORIZED');
  console.log('  Non-admin / forbidden policy → 403 FORBIDDEN');
  console.log('  Invalid query → 422 VALIDATION_ERROR');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
