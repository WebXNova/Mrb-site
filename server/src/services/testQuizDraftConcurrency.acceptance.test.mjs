/**
 * A3 — Quiz draft optimistic concurrency acceptance tests.
 *
 * Run: npm run test:quiz-draft-concurrency
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildErrorResponse } from '../errors/format/errorResponse.js';
import { QuizDraftVersionConflictError } from '../errors/testQuizDraft.errors.js';
import { toPublicDraft } from './testQuizDraftConcurrency.js';

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

console.log('testQuizDraftConcurrency — A3 acceptance\n');

mustContain(
  'src/repositories/testQuizDraft.repository.js',
  [
    'UPDATE test_quiz_drafts',
    'version = version + 1',
    'WHERE test_id = ? AND version = ?',
    'FOR UPDATE',
  ],
  'repository OCC'
);

mustContain(
  'src/services/testQuizDraft.service.js',
  ['raiseDraftVersionConflict', 'expectedVersion', 'updateTestQuizDraftWithVersion'],
  'service OCC'
);

mustContain(
  'src/errors/format/errorResponse.js',
  ['DRAFT_VERSION_CONFLICT', 'CLIENT_SAFE_DETAIL_CODES'],
  'production conflict details'
);

mustContain(
  'src/services/testQuizDraftConcurrency.js',
  ['lastModified', 'admin.test.quiz_draft.version_conflict'],
  'concurrency helpers + audit'
);

{
  const publicDraft = toPublicDraft({
    draftId: 9,
    testId: 14,
    draftPayload: { version: 1, testId: 14, questions: [], totalPoints: 0, savedAt: '2026-01-01T00:00:00.000Z' },
    version: 3,
    createdBy: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T12:00:00.000Z',
    deletedAt: null,
    deletedBy: null,
    materializedVersion: null,
    materializedAt: null,
  });

  assert(publicDraft?.version === 3, 'public draft exposes version');
  assert(publicDraft?.lastModified === '2026-01-02T12:00:00.000Z', 'public draft exposes lastModified');
}

{
  const err = new QuizDraftVersionConflictError(14, {
    expectedVersion: 2,
    currentVersion: 3,
    draft: { draftId: 9, version: 3, lastModified: '2026-01-02T12:00:00.000Z' },
    conflictKind: 'stale_version',
  });

  const prod = buildErrorResponse(err, { isProd: true, includeDebug: false });
  assert(prod.httpStatus === 409, 'conflict is HTTP 409');
  assert(prod.body.error.code === 'DRAFT_VERSION_CONFLICT', 'conflict error code');
  assert(prod.body.details?.currentVersion === 3, 'prod exposes currentVersion');
  assert(prod.body.details?.expectedVersion === 2, 'prod exposes expectedVersion');
  assert(prod.body.details?.conflictKind === 'stale_version', 'prod exposes conflictKind');
  assert(prod.body.details?.lastModified === '2026-01-02T12:00:00.000Z', 'prod exposes lastModified');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
