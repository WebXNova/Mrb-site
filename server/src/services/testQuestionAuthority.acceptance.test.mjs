/**
 * Test Question Authority — acceptance tests.
 *
 * Run: npm run test:question-authority
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  countValidDraftQuestions,
  QUESTION_AUTHORITY_SOURCES,
  resolveTestQuestionAuthority,
} from './testQuestionAuthority.service.js';
import { evaluateTestCompleteness } from './testCompleteness.service.js';

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
    assert(text.includes(needle), `${label}: "${needle}" in ${fileRel}`);
  }
}

const validMcq = {
  id: 'q-1',
  questionType: 'multiple_choice',
  questionText: '<p>Sample?</p>',
  points: 1,
  collapsed: false,
  showExplanation: false,
  explanation: '',
  choices: [
    { id: 'c1', text: 'A', isCorrect: true },
    { id: 'c2', text: 'B', isCorrect: false },
  ],
};

const invalidMcq = {
  ...validMcq,
  id: 'q-2',
  questionText: '',
};

function createAuthorityMockConnection({
  status = 'DRAFT',
  runtimeCount = 0,
  draftPayload = null,
  draftDeleted = false,
} = {}) {
  return {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (/FROM tests WHERE id = \?/i.test(normalized)) {
        return [[{ id: 14, course_id: 3, status, title: 'T', test_type: 'subject_wise' }], []];
      }
      if (/FROM test_questions tq/i.test(normalized) && /COUNT/i.test(normalized)) {
        return [[{ total: runtimeCount }], []];
      }
      if (/FROM test_quiz_drafts WHERE test_id = \?/i.test(normalized)) {
        if (!draftPayload) return [[], []];
        return [
          [
            {
              draft_id: 9,
              test_id: 14,
              draft_payload: JSON.stringify(draftPayload),
              version: 1,
              created_by: 5,
              created_at: new Date(),
              updated_at: new Date(),
              deleted_at: draftDeleted ? new Date() : null,
              deleted_by: draftDeleted ? 5 : null,
              materialized_version: null,
              materialized_at: null,
            },
          ],
          [],
        ];
      }
      throw new Error(`Unhandled SQL: ${normalized.slice(0, 100)}`);
    },
  };
}

console.log('testQuestionAuthority — acceptance tests\n');

mustContain(
  'src/services/testCompleteness.service.js',
  ['resolveTestQuestionAuthority', 'question_authority_source'],
  'completeness delegates to authority'
);

mustContain(
  'src/services/testPublishEligibility.service.js',
  ['resolveTestQuestionAuthority', 'question_authority: authority'],
  'publish eligibility uses authority'
);

{
  const count = countValidDraftQuestions({
    questions: [validMcq, invalidMcq],
  });
  assert(count === 1, 'counts only valid draft MCQs');
}

{
  const connection = createAuthorityMockConnection({
    status: 'published',
    runtimeCount: 4,
    draftPayload: { version: 1, testId: 14, questions: [validMcq, validMcq] },
  });
  const authority = await resolveTestQuestionAuthority(14, connection);
  assert(authority.source === QUESTION_AUTHORITY_SOURCES.RUNTIME_COMPOSED, 'published test uses runtime only');
  assert(authority.questionCount === 4, 'published ignores draft count');
}

{
  const connection = createAuthorityMockConnection({
    runtimeCount: 5,
    draftPayload: { version: 1, testId: 14, questions: [validMcq, validMcq, validMcq] },
  });
  const authority = await resolveTestQuestionAuthority(14, connection);
  assert(authority.source === QUESTION_AUTHORITY_SOURCES.QUIZ_DRAFT, 'unpublished draft is authoritative');
  assert(authority.questionCount === 3, 'draft count used, not runtime (never both)');
  assert(authority.runtimeComposedCount === 5, 'runtime count still exposed for diagnostics');
}

{
  const connection = createAuthorityMockConnection({ runtimeCount: 2, draftPayload: null });
  const authority = await resolveTestQuestionAuthority(14, connection);
  assert(authority.source === QUESTION_AUTHORITY_SOURCES.RUNTIME_COMPOSED, 'no draft falls back to runtime');
  assert(authority.questionCount === 2, 'legacy manual links still count');
}

{
  const connection = createAuthorityMockConnection({
    runtimeCount: 8,
    draftPayload: { version: 1, testId: 14, questions: [] },
  });
  const authority = await resolveTestQuestionAuthority(14, connection);
  assert(authority.source === QUESTION_AUTHORITY_SOURCES.QUIZ_DRAFT, 'empty draft still authoritative source');
  assert(authority.questionCount === 0, 'empty draft yields zero — does not merge with links');
}

{
  const report = evaluateTestCompleteness(
    { status: 'DRAFT', course_id: 1, title: 'Test Title', test_type: 'subject_wise', category: 'MDCAT', duration_minutes: 30, max_attempts: 1, access_mode: 'private' },
    3,
    'general',
    [1],
    {
      source: QUESTION_AUTHORITY_SOURCES.QUIZ_DRAFT,
      questionCount: 3,
      runtimeComposedCount: 0,
      draftQuestionCount: 3,
      hasQuizDraft: true,
    }
  );
  assert(report.step4_complete === true, 'completeness step4 uses draft valid count');
  assert(report.question_authority_source === QUESTION_AUTHORITY_SOURCES.QUIZ_DRAFT, 'report exposes authority source');
}

{
  const report = evaluateTestCompleteness(
    { status: 'DRAFT', course_id: 1, title: 'Test Title', test_type: 'subject_wise', category: 'MDCAT', duration_minutes: 30, max_attempts: 1, access_mode: 'private' },
    5,
    'general',
    [1],
    {
      source: QUESTION_AUTHORITY_SOURCES.RUNTIME_COMPOSED,
      questionCount: 5,
      runtimeComposedCount: 5,
      draftQuestionCount: 0,
      hasQuizDraft: false,
    }
  );
  assert(report.step4_complete === false, 'G-03: runtime links without draft do not complete step4');
  assert(report.can_publish === false, 'G-03: cannot publish without quiz draft');
  assert(report.missing_fields.includes('quiz_draft'), 'G-03: missing quiz_draft surfaced');
}

{
  const publishText = readFileSync(
    path.join(serverRoot, 'src/services/testPublishEligibility.service.js'),
    'utf8'
  );
  assert(!publishText.includes('Math.max(activeQuestionCount, draftQuestionCount)'), 'Math.max removed from publish');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
