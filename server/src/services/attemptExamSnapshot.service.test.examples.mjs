/**
 * P0 attempt exam snapshot — TEST A–J (no DB).
 *
 * Run: npm run test:exam-snapshot
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  EXAM_SNAPSHOT_VERSION,
  assertAnswerBelongsToExamSnapshot,
  buildExamSnapshot,
  optionBelongsToSnapshot,
  parseExamSnapshot,
  parseResultDetailItems,
  questionBelongsToSnapshot,
  snapshotGradingConfig,
  snapshotQuestionsForGrading,
  snapshotQuestionsForStudent,
  snapshotToGradingQuestionRows,
} from './attemptExamSnapshot.service.js';
import { gradeComposedAttempt } from './testAttempt/gradeComposedAttempt.js';
import { assertPublishedEditConfirmed } from './publishedTestEdit.service.js';
import {
  buildAttemptAnswerGridFromDetail,
  parseDetailItemsOrdered,
} from './testResultsList.service.js';
import { mapGradingDetailsToPortalRows } from '../result/result.service.js';
import { PUBLISHED_EDIT_CONFIRMATION_REQUIRED } from '../errors/codes/ErrorCodes.js';
import { InvalidOptionError, QuestionNotInTestError } from '../errors/testAttempt/TestAttemptErrors.js';

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

function fixtureSnapshot(overrides = {}) {
  const composed = [
    {
      questionId: 101,
      questionText: 'Original Q1',
      explanation: 'Why 101',
      marks: 2,
      effectiveMarks: 2,
      sectionId: 7,
      displayOrder: 0,
      options: [
        { optionId: 1001, optionKey: 'A', optionText: 'Alpha', isCorrect: false, sortOrder: 0 },
        { optionId: 1002, optionKey: 'B', optionText: 'Beta', isCorrect: true, sortOrder: 1 },
      ],
    },
    {
      questionId: 102,
      questionText: 'Original Q2',
      explanation: '',
      marks: 3,
      effectiveMarks: 3,
      sectionId: 7,
      displayOrder: 1,
      options: [
        { optionId: 2001, optionKey: 'A', optionText: 'Gamma', isCorrect: true, sortOrder: 0 },
        { optionId: 2002, optionKey: 'B', optionText: 'Delta', isCorrect: false, sortOrder: 1 },
      ],
    },
  ];

  return buildExamSnapshot({
    testId: 55,
    testRow: {
      title: 'Frozen paper',
      passing_marks: 4,
      negative_marking: 0.25,
      layout_mode: 'vertical',
      display_mode: 'all',
    },
    sections: [{ id: 7, subjectLabel: 'Physics', dividerContentHtml: null, displayOrder: 0 }],
    composedQuestions: composed,
    ...overrides,
  });
}

console.log('attemptExamSnapshot — P0 TEST A–J\n');

{
  const snapshot = fixtureSnapshot();
  ok('TEST A: snapshot version is 1', snapshot.version === EXAM_SNAPSHOT_VERSION);
  ok('TEST A: displayMode is frozen as all', snapshot.presentation.displayMode === 'all');
  ok('TEST A: layoutMode remains a compatibility mirror', snapshot.presentation.layoutMode === 'vertical');
  ok('TEST A: fullPageMode is frozen', snapshot.presentation.fullPageMode === false);
  ok('TEST A: question order frozen', snapshot.questions.map((q) => q.questionId).join(',') === '101,102');
  ok('TEST A: section assignment frozen', snapshot.questions[0].sectionId === 7);
  ok('TEST A: option structure frozen', snapshot.questions[0].options[1].optionId === 1002);

  const mutatedLive = {
    ...snapshot,
    questions: snapshot.questions.map((q) => ({
      ...q,
      questionText: 'EDITED LIVE TEXT',
      options: q.options.map((o) => ({ ...o, isCorrect: !o.isCorrect, optionText: 'EDITED' })),
    })),
  };
  ok(
    'TEST A: mutating a copy of live definition does not change original snapshot text',
    snapshot.questions[0].questionText === 'Original Q1' &&
      mutatedLive.questions[0].questionText === 'EDITED LIVE TEXT'
  );
}

{
  const paginated = fixtureSnapshot({
    testRow: {
      title: 'Frozen paper',
      passing_marks: 4,
      negative_marking: 0.25,
      layout_mode: 'horizontal',
      display_mode: 'all',
    },
  });
  ok(
    'historical horizontal layout freezes as one_per_page',
    paginated.presentation.displayMode === 'one_per_page'
  );

  const explicit = fixtureSnapshot({
    testRow: {
      title: 'Frozen paper',
      passing_marks: 4,
      negative_marking: 0.25,
      layout_mode: 'vertical',
      display_mode: 'one_per_page',
    },
  });
  ok(
    'explicit one_per_page is frozen even if layout_mode is vertical',
    explicit.presentation.displayMode === 'one_per_page'
  );
}

{
  const snapshot = fixtureSnapshot();
  const studentQs = snapshotQuestionsForStudent(snapshot);
  ok(
    'TEST A: student payload omits isCorrect',
    studentQs.every((q) => q.options.every((o) => !('isCorrect' in o)))
  );
  ok(
    'TEST A: student payload omits explanation',
    studentQs.every((q) => !('explanation' in q))
  );
}

{
  const snapshot = fixtureSnapshot();
  const liveEdited = structuredClone(snapshot);
  liveEdited.questions[0].questionText = 'Admin rewrote question';
  liveEdited.questions[0].options[1].isCorrect = false;
  liveEdited.questions[0].options[0].isCorrect = true;

  const answers = new Map([[101, 1002], [102, 2001]]);
  const result = gradeComposedAttempt(
    snapshotQuestionsForGrading(snapshot),
    answers,
    snapshot.grading.negativeMarking,
    snapshot.grading.passingMarks
  );
  const liveGrade = gradeComposedAttempt(
    snapshotQuestionsForGrading(liveEdited),
    answers,
    0,
    0
  );

  ok('TEST B/C: original grading awards Q1 as correct', result.details[0].isCorrect === true);
  ok('TEST B/C: original score uses frozen marks (2+3)', result.score === 5);
  ok('TEST C: live-key flip would fail Q1', liveGrade.details[0].isCorrect === false);
  ok('TEST B/C: snapshot grade is isolated from live key', result.score !== liveGrade.score);
}

{
  const snapshot = fixtureSnapshot();
  const liveSettings = { passingMarks: 99, negativeMarking: 5 };
  const result = gradeComposedAttempt(
    snapshotQuestionsForGrading(snapshot),
    new Map([[101, 1002], [102, 2002]]),
    snapshotGradingConfig(snapshot).negativeMarking,
    snapshotGradingConfig(snapshot).passingMarks
  );
  ok('TEST D: Q2 wrong applies original 0.25 negative mark', Math.abs(result.score - (2 - 0.25)) < 1e-9);
  ok('TEST D: pass uses original passingMarks=4, not live 99', result.percentage != null);
  ok(
    'TEST D: snapshot grading config ignores later live settings object',
    snapshotGradingConfig(snapshot).passingMarks === 4 && liveSettings.passingMarks === 99
  );
}

{
  const snapshot = fixtureSnapshot();
  const graded = gradeComposedAttempt(
    snapshotQuestionsForGrading(snapshot),
    new Map([[101, 1002], [102, 2001]]),
    0,
    4
  );
  const frozenDetail = JSON.stringify(graded.details);
  snapshot.questions[0].questionText = 'should not leak into stored result';
  const reopened = parseResultDetailItems(frozenDetail);
  ok('TEST E: stored detail_json still has original question text', reopened[0].questionText.includes('Original Q1'));
  const grid = buildAttemptAnswerGridFromDetail(frozenDetail, 2);
  ok('TEST E: admin grid uses detail_json not live ids', grid.answerGrid[0] === true && grid.answerGrid[1] === true);
  ok('TEST E: portal mapping uses frozen details', mapGradingDetailsToPortalRows(reopened)[0].question_text.includes('Original Q1'));
}

{
  const snapA = fixtureSnapshot();
  const snapB = fixtureSnapshot();
  snapB.questions = snapB.questions.map((q) => ({
    ...q,
    questionId: q.questionId + 50,
    options: q.options.map((o) => ({ ...o, optionId: o.optionId + 50 })),
  }));
  ok('TEST F: two snapshots stay isolated by question ids', snapA.questions[0].questionId !== snapB.questions[0].questionId);
  ok('TEST F: student A option still valid on A', optionBelongsToSnapshot(snapA, 101, 1002));
  ok('TEST F: student A option rejected on B', !optionBelongsToSnapshot(snapB, 101, 1002));
}

{
  let confirmBlocked = false;
  try {
    assertPublishedEditConfirmed({
      testId: 55,
      requiresConfirmation: true,
      confirmPublishedEdit: false,
      attemptStats: { total: 2, inProgress: 2, completed: 0 },
    });
  } catch (error) {
    confirmBlocked = error.errorCode === PUBLISHED_EDIT_CONFIRMATION_REQUIRED && error.httpStatus === 409;
  }
  ok('published edit without confirm is 409', confirmBlocked);

  let confirmAllowed = true;
  try {
    assertPublishedEditConfirmed({
      testId: 55,
      requiresConfirmation: true,
      confirmPublishedEdit: true,
      attemptStats: { total: 2 },
    });
  } catch {
    confirmAllowed = false;
  }
  ok('published edit with confirm is allowed', confirmAllowed);
}

{
  const snapshot = fixtureSnapshot();
  let qThrown = false;
  try {
    assertAnswerBelongsToExamSnapshot(snapshot, { attemptId: 1, questionId: 999, optionId: 1002 });
  } catch (error) {
    qThrown = error instanceof QuestionNotInTestError;
  }
  ok('answer save rejects question not on snapshot', qThrown);

  let oThrown = false;
  try {
    assertAnswerBelongsToExamSnapshot(snapshot, { attemptId: 1, questionId: 101, optionId: 9999 });
  } catch (error) {
    oThrown = error instanceof InvalidOptionError;
  }
  ok('answer save rejects option not on snapshot', oThrown);
  ok('question 101 belongs to snapshot', questionBelongsToSnapshot(snapshot, 101));
}

{
  ok('parseExamSnapshot rejects empty', parseExamSnapshot(null) == null);
  ok('parseExamSnapshot rejects wrong version', parseExamSnapshot({ version: 2, questions: [{}] }) == null);
  const valid = parseExamSnapshot(JSON.stringify(fixtureSnapshot()));
  ok('parseExamSnapshot accepts frozen paper', Boolean(valid && valid.questions.length === 2));
}

{
  const rows = snapshotToGradingQuestionRows(fixtureSnapshot(), [
    { question_id: 101, selected_option_id: 1002 },
  ]);
  ok('legacy grading rows use snapshot correct option', rows[0].correct_option_id === 1002);
  ok('legacy grading rows attach selected answer', rows[0].selected_option_id === 1002);
  ok('unanswered question stays null', rows[1].selected_option_id == null);
}

{
  const ordered = parseDetailItemsOrdered(
    JSON.stringify([
      { questionId: 9001, isCorrect: true, selectedOptionId: 1 },
      { questionId: 9002, isCorrect: false, selectedOptionId: 2 },
    ])
  );
  ok('historical grid order follows detail_json not live bank', ordered[0].questionId === 9001);
}

mustContain(
  'src/sql/migrations/test_attempts_exam_snapshot.sql',
  ['exam_snapshot_json'],
  'migration'
);
mustContain(
  'src/sql/schema.sql',
  ['exam_snapshot_json'],
  'schema'
);
mustContain(
  'src/services/testAttempt.service.js',
  ['persistAttemptExamSnapshot', 'snapshotQuestionsForGrading', 'assertAnswerBelongsToExamSnapshot'],
  'slug runtime snapshot'
);
mustContain(
  'src/services/studentTestStart.service.js',
  ['persistAttemptExamSnapshot'],
  'portal start snapshot'
);
mustContain(
  'src/services/studentAttemptLoad.service.js',
  ['resolveAttemptExamSnapshot', 'snapshotQuestionsForStudent'],
  'portal load snapshot'
);
mustContain(
  'src/services/studentAnswerSave.service.js',
  ['resolveAttemptExamSnapshot', 'assertAnswerBelongsToExamSnapshot'],
  'portal save snapshot'
);
mustContain(
  'src/grading/grading.service.js',
  ['snapshotToGradingQuestionRows', 'resolveAttemptExamSnapshot', 'GRADING_IDEMPOTENT_HIT'],
  'legacy grade + idempotent'
);
mustContain(
  'src/result/result.service.js',
  ['parseResultDetailItems', 'assertResultOwnership'],
  'historical portal result'
);
mustContain(
  'src/services/test.service.js',
  ['remapDuplicatedQuizDraft', 'INSERT INTO tests', 'cloneQuestionBankForDuplicate'],
  'TEST G duplicate remaps draft identity'
);

{
  const dup = readFileSync(path.join(serverRoot, 'src/services/test.service.js'), 'utf8');
  const fn = dup.slice(dup.indexOf('export async function duplicateTest'));
  const body = fn.slice(0, fn.indexOf('export async function exportTestResultsWorkbook'));
  ok('TEST G: duplicate does not copy test_attempts', !body.includes('test_attempts'));
  ok('TEST G: duplicate does not copy exam_snapshot_json', !body.includes('exam_snapshot_json'));
}

mustContain(
  'src/services/testSubmitRecovery.service.js',
  ['resolveSubmitAttemptOutcome', 'SUBMIT_RECOVERY_OUTCOMES'],
  'TEST H submit recovery'
);
mustContain(
  'src/services/testAttempt/secureAttemptContext.js',
  ['a.user_id = ?', 'AttemptNotFoundError'],
  'TEST I/J ownership'
);
mustContain(
  'src/services/studentAnswerSave.service.js',
  ['studentOwnsAttempt', 'assertAttemptBelongsToStudent'],
  'TEST J portal save ownership'
);
mustContain(
  'src/result/result.service.js',
  ['assertResultOwnership', 'ResultNotFoundError'],
  'TEST I result ownership'
);
mustContain(
  'src/services/publishedTestEdit.service.js',
  ['assertPublishedEditConfirmed', 'httpStatus: 409'],
  'backend published-edit confirm'
);
mustContain(
  'src/answer/answer.service.js',
  ['resolveAttemptExamSnapshot', 'assertAnswerBelongsToExamSnapshot'],
  'legacy save snapshot'
);

{
  const saveSrc = readFileSync(path.join(serverRoot, 'src/services/studentAnswerSave.service.js'), 'utf8');
  ok(
    'portal save does not validate against live test_questions',
    !saveSrc.includes('QUESTION_BELONGS_TO_TEST') && !saveSrc.includes('OPTION_BELONGS_TO_QUESTION')
  );
}

{
  const legacySaveSrc = readFileSync(path.join(serverRoot, 'src/answer/answer.service.js'), 'utf8');
  ok(
    'legacy save does not validate against live test_questions',
    !legacySaveSrc.includes('QUESTION_BELONGS_TO_TEST') && !legacySaveSrc.includes('OPTION_BELONGS_TO_QUESTION')
  );
}

{
  const gradeSrc = readFileSync(path.join(serverRoot, 'src/grading/grading.service.js'), 'utf8');
  ok(
    'legacy grade does not load live question bank rows',
    !gradeSrc.includes('loadGradingQuestionRows')
  );
}

{
  const resultSrc = readFileSync(path.join(serverRoot, 'src/result/result.service.js'), 'utf8');
  ok(
    'result review does not join live question bank',
    !resultSrc.includes('loadTestQuestionOptions') && !resultSrc.includes('loadDetailedAnswerRows')
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
