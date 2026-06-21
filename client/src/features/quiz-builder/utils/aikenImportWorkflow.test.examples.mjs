/**
 * Quiz builder Aiken import workflow tests (scenarios 1–5).
 * Run: node src/features/quiz-builder/utils/aikenImportWorkflow.test.examples.mjs
 */
import {
  AIKEN_IMPORT_OUTCOME,
  AIKEN_IMPORT_WORKFLOW_PHASE,
  buildQuizAikenImportResult,
  classifyZeroImportOutcome,
  mapImportEntriesToFailures,
  normalizeAikenPreviewResponse,
  resolvePreviewOutcome,
} from './aikenImportWorkflow.js';

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

function runCase(name, fn) {
  console.log(`\n[${name}]`);
  try {
    fn();
  } catch (error) {
    failed += 1;
    console.error(`  ✗ threw: ${error.message}`);
  }
}

function mockPreviewResponse({
  total = 100,
  parsed = 100,
  valid = 100,
  duplicates = 0,
  failed = 0,
  imported = 100,
  errors = [],
  duplicateItems = [],
}) {
  return {
    imported,
    questions: Array.from({ length: imported }, (_, index) => ({
      question_text: `Q${index + 1}`,
      correctAnswer: 'A',
      options: [
        { key: 'A', text: 'a' },
        { key: 'B', text: 'b' },
        { key: 'C', text: 'c' },
        { key: 'D', text: 'd' },
      ],
    })),
    errors,
    duplicates: duplicateItems,
    skipped: duplicateItems,
    diagnostics: {
      totalQuestions: total,
      parsedQuestions: parsed,
      validQuestions: valid,
      duplicates,
      failedQuestions: failed,
    },
  };
}

console.log('aikenImportWorkflow scenario tests\n');

runCase('Scenario 1 — 100 valid questions', () => {
  const normalized = normalizeAikenPreviewResponse(mockPreviewResponse({}));
  const failures = mapImportEntriesToFailures(normalized.errors);
  const duplicates = mapImportEntriesToFailures(normalized.duplicateItems);
  const outcome = resolvePreviewOutcome({
    diagnostics: normalized.diagnostics,
    failures,
    duplicateItems: duplicates,
    importedCount: normalized.diagnostics.imported,
  });

  assert(outcome === AIKEN_IMPORT_OUTCOME.SUCCESS, 'outcome is success');
  assert(normalized.diagnostics.imported === 100, '100 imported');
  assert(classifyZeroImportOutcome(normalized.diagnostics, failures, duplicates) === null, 'not zero import');
});

runCase('Scenario 2 — 95 valid, 5 invalid', () => {
  const errors = Array.from({ length: 5 }, (_, index) => ({
    questionNumber: index + 1,
    lineNumber: 10 + index,
    errorCode: 'MISSING_OPTION',
    message: 'Option A missing',
    validationLayer: 'aiken_parse',
  }));
  const normalized = normalizeAikenPreviewResponse(
    mockPreviewResponse({
      total: 100,
      parsed: 95,
      valid: 95,
      failed: 5,
      imported: 95,
      errors,
    })
  );
  const failures = mapImportEntriesToFailures(normalized.errors);
  const outcome = resolvePreviewOutcome({
    diagnostics: normalized.diagnostics,
    failures,
    duplicateItems: [],
    importedCount: 95,
  });

  assert(outcome === AIKEN_IMPORT_OUTCOME.PARTIAL_SUCCESS, 'outcome is partial success');
  assert(normalized.diagnostics.imported === 95, '95 imported');
  assert(failures.length === 5, '5 failures mapped');
  assert(failures[0].errorCode === 'MISSING_OPTION', 'failure code preserved');
});

runCase('Scenario 3 — all duplicates', () => {
  const duplicateItems = [
    {
      questionNumber: 1,
      errorCode: 'DUPLICATE_EXACT_IN_FILE',
      message: 'Exact duplicate of question 2 in this file.',
      validationLayer: 'duplicate_detection',
    },
    {
      questionNumber: 2,
      errorCode: 'DUPLICATE_EXACT_IN_FILE',
      message: 'Exact duplicate of question 1 in this file.',
      validationLayer: 'duplicate_detection',
    },
  ];
  const normalized = normalizeAikenPreviewResponse(
    mockPreviewResponse({
      total: 2,
      parsed: 2,
      valid: 2,
      duplicates: 2,
      imported: 0,
      duplicateItems,
    })
  );
  const duplicates = mapImportEntriesToFailures(normalized.duplicateItems);
  const outcome = classifyZeroImportOutcome(normalized.diagnostics, [], duplicates);

  assert(outcome === AIKEN_IMPORT_OUTCOME.ALL_DUPLICATES, 'all duplicates outcome');
  assert(normalized.diagnostics.imported === 0, '0 imported');
});

runCase('Scenario 4 — 0 valid', () => {
  const errors = [
    {
      questionNumber: 1,
      lineNumber: 8,
      errorCode: 'INVALID_ANSWER',
      message: 'Answer must be A, B, C or D',
      validationLayer: 'aiken_parse',
    },
  ];
  const normalized = normalizeAikenPreviewResponse(
    mockPreviewResponse({
      total: 1,
      parsed: 0,
      valid: 0,
      failed: 1,
      imported: 0,
      errors,
    })
  );
  const failures = mapImportEntriesToFailures(normalized.errors);
  const outcome = classifyZeroImportOutcome(normalized.diagnostics, failures, []);

  assert(outcome === AIKEN_IMPORT_OUTCOME.VALIDATION_FAILED, 'validation failed outcome');
  const result = buildQuizAikenImportResult({
    fileLabel: 'broken.txt',
    outcome,
    workflowPhase: AIKEN_IMPORT_WORKFLOW_PHASE.VALIDATION_FAILED,
    diagnostics: normalized.diagnostics,
    failures,
    importedCount: 0,
    draftSaveAttempted: false,
    draftSaved: false,
  });
  assert(result.draftSaveAttempted === false, 'draft save not attempted');
  assert(result.headline.includes('blocked'), 'clear blocked headline');
});

runCase('Scenario 5 — backend error result shape', () => {
  const result = buildQuizAikenImportResult({
    fileLabel: 'test.txt',
    outcome: AIKEN_IMPORT_OUTCOME.BACKEND_ERROR,
    workflowPhase: AIKEN_IMPORT_WORKFLOW_PHASE.BACKEND_ERROR,
    diagnostics: {
      totalQuestions: 0,
      parsedQuestions: 0,
      validQuestions: 0,
      duplicates: 0,
      failedQuestions: 0,
      imported: 0,
    },
    failures: [],
    duplicateItems: [],
    importedCount: 0,
    draftSaveAttempted: false,
    draftSaved: false,
    saveError: 'Cannot connect to API server.',
  });

  assert(result.outcome === AIKEN_IMPORT_OUTCOME.BACKEND_ERROR, 'backend error outcome');
  assert(result.detail.includes('Cannot connect'), 'proper failure message');
  assert(result.draftSaveAttempted === false, 'save not attempted on backend error');
});

runCase('draft save failed is distinct from preview failure', () => {
  const normalized = normalizeAikenPreviewResponse(mockPreviewResponse({ total: 5, imported: 5 }));
  const result = buildQuizAikenImportResult({
    fileLabel: 'quiz.txt',
    outcome: AIKEN_IMPORT_OUTCOME.DRAFT_SAVE_FAILED,
    workflowPhase: AIKEN_IMPORT_WORKFLOW_PHASE.DRAFT_SAVE_FAILED,
    diagnostics: normalized.diagnostics,
    failures: [],
    importedCount: 5,
    draftSaveAttempted: true,
    draftSaved: false,
    saveError: 'Draft sync is not available.',
  });

  assert(result.draftSaveAttempted === true, 'draft save was attempted');
  assert(result.draftSaved === false, 'draft not saved');
  assert(!result.detail.includes('Nothing was added'), 'not a preview-zero message');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
