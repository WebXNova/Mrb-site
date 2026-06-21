import { formatStructuredImportError } from './aikenImportFormatters.js';

/** @typedef {'idle' | 'preview_running' | 'preview_complete' | 'validation_failed' | 'all_duplicates' | 'ready_to_import' | 'saving_draft' | 'draft_saved' | 'draft_save_failed' | 'backend_error'} AikenImportWorkflowPhase */

/** @typedef {'success' | 'partial_success' | 'validation_failed' | 'all_duplicates' | 'preview_zero' | 'draft_save_failed' | 'draft_save_offline' | 'backend_error' | 'empty_file' | 'file_rejected'} AikenImportOutcome */

/**
 * @typedef {{
 *   totalQuestions: number,
 *   parsedQuestions: number,
 *   validQuestions: number,
 *   duplicates: number,
 *   failedQuestions: number,
 *   imported: number,
 * }} AikenImportDiagnostics
 */

/**
 * @typedef {{
 *   questionNumber: number,
 *   lineNumber?: number | null,
 *   errorCode: string,
 *   message: string,
 *   headline: string,
 *   validationLayer?: string,
 * }} AikenImportFailureDisplay
 */

/**
 * @typedef {{
 *   fileLabel: string,
 *   workflowPhase: AikenImportWorkflowPhase,
 *   outcome: AikenImportOutcome,
 *   diagnostics: AikenImportDiagnostics,
 *   failures: AikenImportFailureDisplay[],
 *   duplicateItems: AikenImportFailureDisplay[],
 *   importedCount: number,
 *   draftSaveAttempted: boolean,
 *   draftSaved: boolean,
 *   headline: string,
 *   detail: string,
 * }} QuizAikenImportResult
 */

export const AIKEN_IMPORT_WORKFLOW_PHASE = Object.freeze({
  IDLE: 'idle',
  PREVIEW_RUNNING: 'preview_running',
  PREVIEW_COMPLETE: 'preview_complete',
  VALIDATION_FAILED: 'validation_failed',
  ALL_DUPLICATES: 'all_duplicates',
  READY_TO_IMPORT: 'ready_to_import',
  SAVING_DRAFT: 'saving_draft',
  DRAFT_SAVED: 'draft_saved',
  DRAFT_SAVE_FAILED: 'draft_save_failed',
  BACKEND_ERROR: 'backend_error',
});

export const AIKEN_IMPORT_OUTCOME = Object.freeze({
  SUCCESS: 'success',
  PARTIAL_SUCCESS: 'partial_success',
  VALIDATION_FAILED: 'validation_failed',
  ALL_DUPLICATES: 'all_duplicates',
  PREVIEW_ZERO: 'preview_zero',
  DRAFT_SAVE_FAILED: 'draft_save_failed',
  DRAFT_SAVE_OFFLINE: 'draft_save_offline',
  BACKEND_ERROR: 'backend_error',
  EMPTY_FILE: 'empty_file',
  FILE_REJECTED: 'file_rejected',
});

/**
 * @param {unknown} response
 */
export function normalizeAikenPreviewResponse(response) {
  const diagnosticsRaw = response?.diagnostics ?? {};
  const errors = Array.isArray(response?.errors) ? response.errors : [];
  const duplicateItems = Array.isArray(response?.duplicates)
    ? response.duplicates
    : Array.isArray(response?.skipped)
      ? response.skipped
      : [];
  const questions = Array.isArray(response?.questions) ? response.questions : [];
  const imported = Number(response?.imported ?? questions.length);

  const diagnostics = {
    totalQuestions: Number(diagnosticsRaw.totalQuestions ?? 0),
    parsedQuestions: Number(diagnosticsRaw.parsedQuestions ?? questions.length),
    validQuestions: Number(diagnosticsRaw.validQuestions ?? imported + duplicateItems.length),
    duplicates: Number(diagnosticsRaw.duplicates ?? duplicateItems.length),
    failedQuestions: Number(diagnosticsRaw.failedQuestions ?? errors.length),
    imported,
  };

  return {
    diagnostics,
    questions,
    errors,
    duplicateItems,
    warnings: Array.isArray(response?.warnings) ? response.warnings : [],
  };
}

/**
 * @param {Array<Record<string, unknown>>} entries
 * @returns {AikenImportFailureDisplay[]}
 */
export function mapImportEntriesToFailures(entries) {
  if (!Array.isArray(entries)) return [];

  return entries.map((entry, index) => {
    const formatted = formatStructuredImportError(entry, index);
    const lineNumber = Number(entry?.lineNumber);
    const questionNumber = Number.isFinite(Number(entry?.questionNumber))
      ? Number(entry.questionNumber)
      : formatted.headline.match(/Question (\d+)/)?.[1]
        ? Number(formatted.headline.match(/Question (\d+)/)[1])
        : index + 1;

    return {
      questionNumber,
      lineNumber: Number.isFinite(lineNumber) && lineNumber > 0 ? lineNumber : null,
      errorCode: formatted.errorCode,
      message: formatted.message,
      headline: `Question ${questionNumber}`,
      validationLayer: formatted.validationLayer,
    };
  });
}

/**
 * @param {AikenImportDiagnostics} diagnostics
 * @param {AikenImportFailureDisplay[]} failures
 * @param {AikenImportFailureDisplay[]} duplicateItems
 */
export function classifyZeroImportOutcome(diagnostics, failures, duplicateItems) {
  const { imported, validQuestions, duplicates, failedQuestions, totalQuestions } = diagnostics;

  if (imported > 0) {
    return null;
  }

  if (validQuestions > 0 && duplicates > 0 && failedQuestions === 0) {
    return AIKEN_IMPORT_OUTCOME.ALL_DUPLICATES;
  }

  if (totalQuestions === 0 && failures.length === 0) {
    return AIKEN_IMPORT_OUTCOME.PREVIEW_ZERO;
  }

  if (failedQuestions > 0 || failures.length > 0) {
    return AIKEN_IMPORT_OUTCOME.VALIDATION_FAILED;
  }

  if (duplicateItems.length > 0) {
    return AIKEN_IMPORT_OUTCOME.ALL_DUPLICATES;
  }

  return AIKEN_IMPORT_OUTCOME.PREVIEW_ZERO;
}

/**
 * @param {{
 *   diagnostics: AikenImportDiagnostics,
 *   failures: AikenImportFailureDisplay[],
 *   duplicateItems: AikenImportFailureDisplay[],
 *   importedCount: number,
 * }} input
 */
export function resolvePreviewOutcome({ diagnostics, failures, duplicateItems, importedCount }) {
  const zeroOutcome = classifyZeroImportOutcome(diagnostics, failures, duplicateItems);
  if (zeroOutcome) {
    return zeroOutcome;
  }

  if (diagnostics.failedQuestions > 0 || diagnostics.duplicates > 0) {
    return AIKEN_IMPORT_OUTCOME.PARTIAL_SUCCESS;
  }

  return AIKEN_IMPORT_OUTCOME.SUCCESS;
}

/**
 * @param {AikenImportOutcome} outcome
 */
export function outcomeToWorkflowPhase(outcome) {
  switch (outcome) {
    case AIKEN_IMPORT_OUTCOME.ALL_DUPLICATES:
      return AIKEN_IMPORT_WORKFLOW_PHASE.ALL_DUPLICATES;
    case AIKEN_IMPORT_OUTCOME.VALIDATION_FAILED:
    case AIKEN_IMPORT_OUTCOME.PREVIEW_ZERO:
      return AIKEN_IMPORT_WORKFLOW_PHASE.VALIDATION_FAILED;
    case AIKEN_IMPORT_OUTCOME.DRAFT_SAVE_FAILED:
      return AIKEN_IMPORT_WORKFLOW_PHASE.DRAFT_SAVE_FAILED;
    case AIKEN_IMPORT_OUTCOME.DRAFT_SAVE_OFFLINE:
      return AIKEN_IMPORT_WORKFLOW_PHASE.DRAFT_SAVE_FAILED;
    case AIKEN_IMPORT_OUTCOME.BACKEND_ERROR:
      return AIKEN_IMPORT_WORKFLOW_PHASE.BACKEND_ERROR;
    case AIKEN_IMPORT_OUTCOME.SUCCESS:
    case AIKEN_IMPORT_OUTCOME.PARTIAL_SUCCESS:
      return AIKEN_IMPORT_WORKFLOW_PHASE.DRAFT_SAVED;
    default:
      return AIKEN_IMPORT_WORKFLOW_PHASE.PREVIEW_COMPLETE;
  }
}

/**
 * @param {AikenImportOutcome} outcome
 * @param {AikenImportDiagnostics} diagnostics
 * @param {number} importedCount
 */
export function buildImportHeadline(outcome, diagnostics, importedCount) {
  switch (outcome) {
    case AIKEN_IMPORT_OUTCOME.SUCCESS:
      return `Imported ${importedCount} ${importedCount === 1 ? 'question' : 'questions'}`;
    case AIKEN_IMPORT_OUTCOME.PARTIAL_SUCCESS:
      return `Imported ${importedCount} of ${diagnostics.totalQuestions} questions`;
    case AIKEN_IMPORT_OUTCOME.ALL_DUPLICATES:
      return `${diagnostics.duplicates} duplicate ${diagnostics.duplicates === 1 ? 'question' : 'questions'} detected`;
    case AIKEN_IMPORT_OUTCOME.VALIDATION_FAILED:
      return `Import blocked — ${diagnostics.failedQuestions} ${diagnostics.failedQuestions === 1 ? 'question has' : 'questions have'} errors`;
    case AIKEN_IMPORT_OUTCOME.PREVIEW_ZERO:
      return 'No questions could be imported';
    case AIKEN_IMPORT_OUTCOME.DRAFT_SAVE_FAILED:
      return 'Questions parsed but draft was not saved';
    case AIKEN_IMPORT_OUTCOME.DRAFT_SAVE_OFFLINE:
      return 'Questions saved locally only';
    case AIKEN_IMPORT_OUTCOME.BACKEND_ERROR:
      return 'Import could not reach the server';
    case AIKEN_IMPORT_OUTCOME.EMPTY_FILE:
      return 'File is empty';
    case AIKEN_IMPORT_OUTCOME.FILE_REJECTED:
      return 'File was rejected';
    default:
      return 'Import finished';
  }
}

/**
 * @param {AikenImportOutcome} outcome
 * @param {AikenImportDiagnostics} diagnostics
 * @param {{ draftSaveAttempted: boolean, draftSaved: boolean, saveError?: string }} save
 */
export function buildImportDetail(outcome, diagnostics, save) {
  const { totalQuestions, parsedQuestions, validQuestions, duplicates, failedQuestions, imported } =
    diagnostics;

  switch (outcome) {
    case AIKEN_IMPORT_OUTCOME.SUCCESS:
      return save.draftSaved
        ? `${imported} ${imported === 1 ? 'question' : 'questions'} added to this test draft.`
        : `${imported} ${imported === 1 ? 'question' : 'questions'} loaded.`;
    case AIKEN_IMPORT_OUTCOME.PARTIAL_SUCCESS:
      return `${imported} imported, ${failedQuestions} failed, ${duplicates} duplicates out of ${totalQuestions} total.`;
    case AIKEN_IMPORT_OUTCOME.ALL_DUPLICATES:
      return `${validQuestions} valid ${validQuestions === 1 ? 'question' : 'questions'} matched existing content and ${duplicates === 1 ? 'was' : 'were'} not added.`;
    case AIKEN_IMPORT_OUTCOME.VALIDATION_FAILED:
      return `Found ${totalQuestions} question blocks: ${parsedQuestions} parsed, ${validQuestions} valid, ${failedQuestions} failed. Nothing was added to this test.`;
    case AIKEN_IMPORT_OUTCOME.PREVIEW_ZERO:
      return totalQuestions > 0
        ? `Found ${totalQuestions} question blocks but none could be imported.`
        : 'The file did not contain any recognizable questions.';
    case AIKEN_IMPORT_OUTCOME.DRAFT_SAVE_FAILED:
      return save.saveError || 'Preview succeeded but saving the test draft failed. Your test was not changed.';
    case AIKEN_IMPORT_OUTCOME.DRAFT_SAVE_OFFLINE:
      return 'Preview succeeded. Questions are backed up in this browser only until you reconnect.';
    case AIKEN_IMPORT_OUTCOME.BACKEND_ERROR:
      return save.saveError || 'Could not preview the file. Check your connection and try again.';
    case AIKEN_IMPORT_OUTCOME.EMPTY_FILE:
      return 'Choose a .txt or .aiken file that contains questions.';
    case AIKEN_IMPORT_OUTCOME.FILE_REJECTED:
      return save.saveError || 'Only .txt or .aiken files up to 1 MB are supported.';
    default:
      return '';
  }
}

/**
 * @param {{
 *   fileLabel: string,
 *   outcome: AikenImportOutcome,
 *   workflowPhase: AikenImportWorkflowPhase,
 *   diagnostics: AikenImportDiagnostics,
 *   failures?: AikenImportFailureDisplay[],
 *   duplicateItems?: AikenImportFailureDisplay[],
 *   importedCount?: number,
 *   draftSaveAttempted?: boolean,
 *   draftSaved?: boolean,
 *   saveError?: string,
 * }} input
 * @returns {QuizAikenImportResult}
 */
export function buildQuizAikenImportResult(input) {
  const diagnostics = input.diagnostics;
  const failures = input.failures ?? [];
  const duplicateItems = input.duplicateItems ?? [];
  const importedCount = Number(input.importedCount ?? diagnostics.imported ?? 0);
  const draftSaveAttempted = Boolean(input.draftSaveAttempted);
  const draftSaved = Boolean(input.draftSaved);

  return {
    fileLabel: input.fileLabel,
    workflowPhase: input.workflowPhase,
    outcome: input.outcome,
    diagnostics,
    failures,
    duplicateItems,
    importedCount,
    draftSaveAttempted,
    draftSaved,
    headline: buildImportHeadline(input.outcome, diagnostics, importedCount),
    detail: buildImportDetail(input.outcome, diagnostics, {
      draftSaveAttempted,
      draftSaved,
      saveError: input.saveError,
    }),
  };
}
