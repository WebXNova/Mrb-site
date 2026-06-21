/**
 * Quiz draft materialization — acceptance tests (mocked DB).
 *
 * Run: npm run test:quiz-draft-materialization
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { materializeQuizDraftToRuntimeTables } from '../services/testQuizDraftMaterialization.service.js';
import { QuizDraftMaterializationError } from '../errors/testQuizDraftMaterialization.errors.js';
import { McqValidationError } from '../validation/mcq/McqValidationError.js';

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

const validDraftQuestion = {
  id: 'q-1',
  title: 'Q1',
  questionType: 'multiple_choice',
  questionText: '<p>Capital of France?</p>',
  points: 2,
  collapsed: false,
  showExplanation: false,
  explanation: '',
  choices: [
    { id: 'c1', text: 'Paris', isCorrect: true },
    { id: 'c2', text: 'London', isCorrect: false },
  ],
};

/**
 * @param {Array<{ sql: string, match: RegExp, rows?: unknown[] }>} plan
 */
function createMockConnection(plan) {
  let bankId = 1000;
  const inserts = {
    question_bank: [],
    question_options: [],
    test_questions: [],
  };

  return {
    inserts,
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();

      for (const step of plan) {
        if (step.match.test(normalized)) {
          if (step.throws) throw step.throws;
          if (step.rows !== undefined) return [step.rows, []];
        }
      }

      if (/FROM tests WHERE id = \? .* FOR UPDATE/i.test(normalized)) {
        return [[{ id: 14, course_id: 3, title: 'Sample', status: 'READY_FOR_PUBLISH' }], []];
      }
      if (/FROM test_quiz_drafts WHERE test_id = \? .* FOR UPDATE/i.test(normalized)) {
        return [
          [
            {
              draft_id: 9,
              test_id: 14,
              draft_payload: JSON.stringify({
                version: 1,
                testId: 14,
                questions: [validDraftQuestion],
                totalPoints: 2,
                savedAt: new Date().toISOString(),
              }),
              version: 1,
              created_by: 5,
              created_at: new Date(),
              updated_at: new Date(),
              deleted_at: null,
              deleted_by: null,
              materialized_version: null,
              materialized_at: null,
            },
          ],
          [],
        ];
      }
      if (/SELECT subject_id FROM test_subjects/i.test(normalized)) {
        return [[{ subject_id: 7 }], []];
      }
      if (/SELECT question_id[\s\S]*FROM test_questions WHERE test_id = \?/i.test(normalized)) {
        return [
          inserts.test_questions.map((row, index) => ({
            question_id: row[1] ?? index + 500,
          })),
          [],
        ];
      }
      if (/DELETE FROM test_questions WHERE test_id/i.test(normalized)) {
        const removed = inserts.test_questions.length;
        inserts.test_questions = [];
        return [{ affectedRows: removed }, []];
      }
      if (/UPDATE question_bank qb[\s\S]*superseded|UPDATE question_bank qb[\s\S]*student_answers/i.test(normalized)) {
        return [{ affectedRows: params.length - 1 }, []];
      }
      if (/SELECT COUNT\(\*\) AS total FROM test_questions/i.test(normalized)) {
        return [[{ total: inserts.test_questions.length }], []];
      }
      if (/INSERT INTO question_bank/i.test(normalized)) {
        bankId += 1;
        inserts.question_bank.push({ id: bankId, params });
        return [{ insertId: bankId }, []];
      }
      if (/INSERT INTO question_options/i.test(normalized)) {
        inserts.question_options.push(params);
        return [{ insertId: 1 }, []];
      }
      if (/SELECT id, question_id, option_key, option_text, is_correct/i.test(normalized)) {
        const questionId = params[0];
        const options = inserts.question_options
          .filter((row) => row[0] === questionId)
          .map((row, index) => ({
            id: index + 1,
            question_id: questionId,
            option_key: row[1],
            option_text: row[2],
            is_correct: row[4],
          }));
        return [options, []];
      }
      if (/SELECT id FROM question_bank WHERE id = \?/i.test(normalized)) {
        return [[{ id: params[0] }], []];
      }
      if (/INSERT INTO test_questions/i.test(normalized)) {
        inserts.test_questions.push(params);
        return [{ insertId: 1 }, []];
      }
      if (/SELECT id FROM test_questions WHERE test_id = \? AND question_id = \?/i.test(normalized)) {
        return [[], []];
      }
      if (/UPDATE test_quiz_drafts[\s\S]*materialized_version/i.test(normalized)) {
        return [{ affectedRows: 1 }, []];
      }

      throw new Error(`Unhandled mock SQL: ${normalized.slice(0, 120)}`);
    },
  };
}

console.log('testQuizDraftMaterialization — acceptance tests\n');

mustContain(
  'src/services/test.service.js',
  ['materializeQuizDraftToRuntimeTables', 'beginTransaction', 'connection.commit()', 'connection.rollback()'],
  'publishTest uses atomic materialization transaction'
);

mustContain(
  'src/services/testQuizDraftMaterialization.service.js',
  [
    'assertPersistedQuestionIntegrity',
    'markDraftMaterialized',
    'clearTestQuestionLinks',
    'softDeleteSupersededMaterializedQuestions',
    'supersededCleanup',
  ],
  'materialization service orchestrates runtime tables'
);

mustContain(
  'src/repositories/testQuizDraftMaterialization.repository.js',
  ['INSERT INTO question_bank', 'INSERT INTO question_options', 'INSERT INTO test_questions'],
  'repository writes all three runtime tables'
);

{
  const connection = createMockConnection([]);
  const summary = await materializeQuizDraftToRuntimeTables(14, 5, connection);
  assert(summary.questionCount === 1, 'materializes one draft question');
  assert(connection.inserts.question_bank.length === 1, 'creates question_bank row');
  assert(connection.inserts.question_options.length === 2, 'creates question_options rows');
  assert(connection.inserts.test_questions.length === 1, 'creates test_questions link');
  assert(summary.supersededCleanup?.deletedCount === 0, 'first materialization has no superseded rows');
}

{
  const connection = createMockConnection([]);
  connection.inserts.test_questions.push([14, 501, 0, 2]);
  const baseQuery = connection.query.bind(connection);
  let softDeleteRan = false;
  connection.query = async (sql, params) => {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (/FROM test_quiz_drafts WHERE test_id = \? .* FOR UPDATE/i.test(normalized)) {
      return [
        [
          {
            draft_id: 9,
            test_id: 14,
            draft_payload: JSON.stringify({
              version: 3,
              testId: 14,
              questions: [validDraftQuestion],
              totalPoints: 2,
            }),
            version: 3,
            created_by: 5,
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
            deleted_by: null,
            materialized_version: 2,
            materialized_at: new Date(),
          },
        ],
        [],
      ];
    }
    if (/SELECT COUNT\(\*\) AS total FROM test_questions/i.test(normalized)) {
      return [[{ total: connection.inserts.test_questions.length }], []];
    }
    if (/UPDATE question_bank qb/i.test(normalized)) {
      softDeleteRan = true;
      assert(params[0] === 5, 'republish cleanup uses materializing user as deleted_by');
      assert(params.includes(501), 'republish cleanup targets superseded question id');
      return [{ affectedRows: 1 }, []];
    }
    return baseQuery(sql, params);
  };

  const summary = await materializeQuizDraftToRuntimeTables(14, 5, connection);
  assert(summary.replacedLinks === 1, 'republish replaces existing test_questions links');
  assert(softDeleteRan, 'republish runs superseded question_bank soft-delete');
  assert(summary.supersededCleanup?.deletedCount === 1, 'republish reports reclaimed superseded rows');
}

{
  const connection = createMockConnection([]);
  connection.query = async function failingQuery(sql) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (/INSERT INTO question_options/i.test(normalized)) {
      throw new Error('Simulated DB failure on options insert');
    }
    return createMockConnection([]).query(sql);
  };

  let caught = null;
  try {
    await materializeQuizDraftToRuntimeTables(14, 5, connection);
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof Error, 'propagates failure for rollback');
}

{
  const connection = createMockConnection([]);
  const emptyDraftQuery = connection.query.bind(connection);
  connection.query = async (sql, params) => {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (/FROM test_quiz_drafts WHERE test_id = \? .* FOR UPDATE/i.test(normalized)) {
      return [
        [
          {
            draft_id: 9,
            test_id: 14,
            draft_payload: JSON.stringify({ version: 1, testId: 14, questions: [], totalPoints: 0 }),
            version: 1,
            created_by: 5,
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
            deleted_by: null,
            materialized_version: null,
            materialized_at: null,
          },
        ],
        [],
      ];
    }
    return emptyDraftQuery(sql, params);
  };

  let caught = null;
  try {
    await materializeQuizDraftToRuntimeTables(14, 5, connection);
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof QuizDraftMaterializationError, 'rejects empty draft');
}

{
  const connection = createMockConnection([]);
  const baseQuery = connection.query.bind(connection);
  connection.query = async (sql, params) => {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (/FROM test_quiz_drafts WHERE test_id = \? .* FOR UPDATE/i.test(normalized)) {
      const payload = {
        version: 2,
        testId: 14,
        questions: [
          validDraftQuestion,
          {
            ...validDraftQuestion,
            id: 'q-2',
            questionText: '',
            choices: [
              { id: 'c1', text: 'A', isCorrect: true },
              { id: 'c2', text: 'B', isCorrect: false },
            ],
          },
        ],
        totalPoints: 4,
      };
      return [
        [
          {
            draft_id: 9,
            test_id: 14,
            draft_payload: JSON.stringify(payload),
            version: 2,
            created_by: 5,
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
            deleted_by: null,
            materialized_version: null,
            materialized_at: null,
          },
        ],
        [],
      ];
    }
    return baseQuery(sql, params);
  };

  let caught = null;
  try {
    await materializeQuizDraftToRuntimeTables(14, 5, connection);
  } catch (error) {
    caught = error;
  }
  assert(
    caught instanceof McqValidationError || caught instanceof QuizDraftMaterializationError,
    'rejects invalid MCQ in draft before DB writes complete'
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
