/**
 * Phase 2 — existing test engine functional fixes (no DB).
 * Run: node src/services/phase2TestEngine.fixes.test.examples.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { remapDuplicatedQuizDraft } from './test.service.js';
import { isShowAnswersAfterSubmitEnabled, sanitizeGradingDetailItems } from './testResultVisibility.service.js';
import { evaluateRetakePolicy } from './testRetakePolicy.service.js';
import { buildAttemptDeliveryLayout } from './attemptDeliveryLayout.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..', '..');
const clientRoot = path.join(serverRoot, '..', 'client');

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

console.log('phase2TestEngine — existing engine fixes\n');

{
  const mapped = remapDuplicatedQuizDraft(
    {
      testId: 10,
      storageKey: '10',
      sections: [{ id: 3, subjectLabel: 'Math', questions: [{ id: 'runtime-q-101', questionId: 101 }] }],
    },
    {
      newTestId: 99,
      questionIdMap: new Map([[101, 501]]),
      sectionIdMap: new Map([[3, 8]]),
    }
  );
  ok('duplicate draft gets new testId', mapped.testId === 99 && mapped.storageKey === '99');
  ok('duplicate draft remaps runtime question id', mapped.sections[0].questions[0].id === 'runtime-q-501');
  ok('duplicate draft remaps numeric questionId', mapped.sections[0].questions[0].questionId === 501);
  ok('duplicate draft remaps section id', mapped.sections[0].id === 8);
}

{
  ok('hide answers is false when column is 0', isShowAnswersAfterSubmitEnabled(0) === false);
  ok('show answers is true when column is 1', isShowAnswersAfterSubmitEnabled(1) === true);
  const hidden = sanitizeGradingDetailItems(
    [{ questionId: 1, questionText: 'Q', correctOptionText: 'B', isCorrect: true }],
    { show_result_immediately: 1, show_answers_after_submit: 0, results_released_at: '2026-01-01T00:00:00.000Z' }
  );
  ok('API omits review when show_answers_after_submit is off', hidden == null);
}

{
  const unlimited = evaluateRetakePolicy({ max_attempts: 0 }, { totalAttempts: 40, hasActiveAttempt: false });
  ok('unlimited attempts still allows a new attempt after many finishes', unlimited.canCreateNew === true);
  const one = evaluateRetakePolicy({ max_attempts: 1 }, { totalAttempts: 1, hasActiveAttempt: false });
  ok('one-attempt tests deny a second start', one.canCreateNew === false);
  const active = evaluateRetakePolicy({ max_attempts: 5 }, { totalAttempts: 1, hasActiveAttempt: true });
  ok('in-progress attempt cannot spawn a second active row', active.canCreateNew === false && active.canResumeActive === true);
}

{
  const composed = [
    { questionId: 1, displayOrder: 0, sectionId: 1, options: [{ optionId: 11, sortOrder: 0 }, { optionId: 12, sortOrder: 1 }] },
    { questionId: 2, displayOrder: 1, sectionId: 1, options: [{ optionId: 21, sortOrder: 0 }] },
    { questionId: 3, displayOrder: 0, sectionId: 2, options: [{ optionId: 31, sortOrder: 0 }] },
    { questionId: 4, displayOrder: 1, sectionId: 2, options: [{ optionId: 41, sortOrder: 0 }] },
  ];
  const layout = buildAttemptDeliveryLayout(composed, { shuffleQuestions: true, shuffleOptions: true, seed: 42 });
  const firstSection = new Set(layout.questionOrder.slice(0, 2));
  const secondSection = new Set(layout.questionOrder.slice(2));
  ok('shuffle keeps section 1 questions together', firstSection.has(1) && firstSection.has(2) && firstSection.size === 2);
  ok('shuffle keeps section 2 questions together', secondSection.has(3) && secondSection.has(4) && secondSection.size === 2);
}

{
  const settingsForm = readFileSync(
    path.join(clientRoot, 'src/admin/components/test-settings/TestSettingsForm.jsx'),
    'utf8'
  );
  ok('duration is a timed field, not an Unlimited radio', !settingsForm.includes('name="duration_mode"'));
  ok('duration copy states 10 hour maximum', settingsForm.includes('10 hours'));
  ok('passing marks are on Settings', settingsForm.includes('id="passing_marks"'));
  ok('option shuffle toggle is on Settings', settingsForm.includes('id="shuffle_options"'));
  ok('full-page copy does not claim 3-strike auto-submit', !settingsForm.includes('auto-submits after the 3rd'));
  const timer = readFileSync(
    path.join(clientRoot, 'src/features/test-taking/hooks/useExamTimer.js'),
    'utf8'
  );
  ok('exam timer resyncs on visibilitychange', timer.includes("visibilitychange"));
  ok('exam timer uses server expires_at', timer.includes('computeRemainingSeconds'));
}

{
  const completeness = readFileSync(path.join(serverRoot, 'src/services/testCompleteness.service.js'), 'utf8');
  ok('completeness allows max_attempts 0', completeness.includes('maxAttempts === 0'));
  const testService = readFileSync(path.join(serverRoot, 'src/services/test.service.js'), 'utf8');
  ok('new tests default to 1 attempt not unlimited', testService.includes('STEP1_DEFAULT_MAX_ATTEMPTS = 1'));
  ok('duplicate clones question_bank rows', testService.includes('cloneQuestionBankForDuplicate'));
  const importRepo = readFileSync(
    path.join(serverRoot, 'src/repositories/testRichContentImport.repository.js'),
    'utf8'
  );
  ok('import question links store section_id', importRepo.includes('section_id'));
  const results = readFileSync(path.join(serverRoot, 'src/services/testResultsList.service.js'), 'utf8');
  ok('admin results list paginates', results.includes('LIMIT ? OFFSET ?'));
  ok('admin results omit bulk answer_details', /answer_grid: answerGrid,\s*\n\s*\};/.test(results));
  ok('admin results export is not captured by attempt detail route',
    readFileSync(path.join(serverRoot, 'src/routes/admin.routes.js'), 'utf8')
      .indexOf("results/export") <
      readFileSync(path.join(serverRoot, 'src/routes/admin.routes.js'), 'utf8')
        .indexOf("results/:attemptId"));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
