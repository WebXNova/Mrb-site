/**
 * G-04 — superseded question_bank cleanup tests.
 *
 * Run: npm run test:materialized-question-cleanup
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  snapshotSupersededQuestionIds,
  softDeleteSupersededMaterializedQuestions,
} from './materializedQuestionCleanup.service.js';
import {
  listLinkedQuestionIdsForTest,
  softDeleteUnlinkedSupersededQuestions,
} from '../repositories/testQuizDraftMaterialization.repository.js';

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

console.log('materializedQuestionCleanup — G-04\n');

mustContain(
  'src/repositories/testQuizDraftMaterialization.repository.js',
  [
    'listLinkedQuestionIdsForTest',
    'softDeleteUnlinkedSupersededQuestions',
    'NOT EXISTS',
    'student_answers',
    'deleted_at = CURRENT_TIMESTAMP',
  ],
  'repository batch soft-delete guards'
);

mustContain(
  'src/services/testQuizDraftMaterialization.service.js',
  ['snapshotSupersededQuestionIds', 'softDeleteSupersededMaterializedQuestions', 'supersededCleanup'],
  'materialization invokes superseded cleanup'
);

mustContain(
  'src/services/materializedQuestionCleanup.service.js',
  ['student_answers', 'Soft-delete only'],
  'cleanup service documents safety rules'
);

{
  const connection = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (/SELECT question_id[\s\S]*FROM test_questions/i.test(normalized)) {
        return [[{ question_id: 41 }, { question_id: 42 }], []];
      }
      throw new Error(`unexpected sql: ${normalized.slice(0, 80)}`);
    },
  };
  const ids = await listLinkedQuestionIdsForTest(connection, 9);
  assert(ids.length === 2 && ids[0] === 41 && ids[1] === 42, 'listLinkedQuestionIdsForTest returns ordered ids');
  const snap = await snapshotSupersededQuestionIds(connection, 9);
  assert(snap.length === 2, 'snapshotSupersededQuestionIds delegates to repository');
}

{
  const deleted = [];
  const connection = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (/UPDATE question_bank qb/i.test(normalized)) {
        deleted.push({ deletedBy: params[0], ids: params.slice(1) });
        return [{ affectedRows: 2 }, []];
      }
      throw new Error(`unexpected sql: ${normalized.slice(0, 80)}`);
    },
  };
  const result = await softDeleteUnlinkedSupersededQuestions(connection, [10, 11, 10], 5);
  assert(result.candidateCount === 2, 'deduplicates candidate ids');
  assert(result.deletedCount === 2, 'returns affected row count');
  assert(result.skippedCount === 0, 'skipped = candidates - deleted');
  assert(deleted[0].deletedBy === 5, 'passes deleted_by user id');
  assert(deleted[0].ids.length === 2, 'batch UPDATE uses IN clause');
}

{
  const connection = {
    async query() {
      return [{ affectedRows: 0 }, []];
    },
  };
  const withAnswers = await softDeleteUnlinkedSupersededQuestions(connection, [99], 3);
  assert(withAnswers.deletedCount === 0, 'zero affected rows when guards block delete');
  assert(withAnswers.skippedCount === 1, 'counts blocked candidates as skipped');
}

{
  const empty = await softDeleteSupersededMaterializedQuestions(
    { async query() { throw new Error('should not query'); } },
    { supersededQuestionIds: [], deletedByUserId: 1 }
  );
  assert(empty.deletedCount === 0 && empty.candidateCount === 0, 'no-op on empty superseded set');

  const invalidActor = await softDeleteSupersededMaterializedQuestions(
    { async query() { throw new Error('should not query'); } },
    { supersededQuestionIds: [1, 2], deletedByUserId: null }
  );
  assert(invalidActor.deletedCount === 0 && invalidActor.skippedCount === 2, 'skips when deleted_by invalid');
}

{
  const batchSize = 150;
  const ids = Array.from({ length: batchSize }, (_, index) => index + 1);
  let placeholderCount = 0;
  const connection = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (/UPDATE question_bank qb/i.test(normalized)) {
        placeholderCount = (normalized.match(/\?/g) || []).length;
        assert(params.length === batchSize + 1, 'scalability: single UPDATE with all candidates');
        return [{ affectedRows: batchSize }, []];
      }
      throw new Error(`unexpected sql: ${normalized.slice(0, 80)}`);
    },
  };
  const scaled = await softDeleteUnlinkedSupersededQuestions(connection, ids, 7);
  assert(scaled.deletedCount === batchSize, 'batch cleanup handles large superseded sets');
  assert(placeholderCount === batchSize + 1, 'one placeholder per id plus deleted_by');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
