import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi } from '../../../api/adminApi.js';
import { getAdminToken } from '../../../auth/session.js';
import {
  mergeAikenIntoQuizDraft,
  mapAikenQuestionsToQuizDraft,
} from '../utils/mapAikenQuestionsToQuizDraft.js';
import { readTextFile, validateAikenImportFile } from '../utils/readTextFile.js';
import {
  AIKEN_DRAFT_SAVE_FAILED,
  AIKEN_DRAFT_SAVE_OFFLINE,
} from '../utils/aikenDraftImportCopy.js';
import {
  AIKEN_IMPORT_OUTCOME,
  AIKEN_IMPORT_WORKFLOW_PHASE,
  buildQuizAikenImportResult,
  mapImportEntriesToFailures,
  normalizeAikenPreviewResponse,
  resolvePreviewOutcome,
} from '../utils/aikenImportWorkflow.js';

const ACCEPT = '.txt,.aiken';

/**
 * @param {import('../types/quizBuilder.types.js').QuizQuestion[]} questions
 */
function sumQuizDraftPoints(questions) {
  return questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0);
}

/**
 * @param {{
 *   existingQuestions: import('../types/quizBuilder.types.js').QuizQuestion[],
 *   onImported: (questions: import('../types/quizBuilder.types.js').QuizQuestion[]) => void,
 *   persistDraft?: (questions: import('../types/quizBuilder.types.js').QuizQuestion[], totalPoints: number) => Promise<{ ok: boolean, error?: string, offline?: boolean }>,
 *   disabled?: boolean,
 * }} options
 */
export function useQuizAikenFileImport({
  existingQuestions,
  onImported,
  persistDraft,
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [workflowPhase, setWorkflowPhase] = useState(
    /** @type {import('../utils/aikenImportWorkflow.js').AikenImportWorkflowPhase} */ (
      AIKEN_IMPORT_WORKFLOW_PHASE.IDLE
    )
  );
  const [lastImportResult, setLastImportResult] = useState(
    /** @type {import('../utils/aikenImportWorkflow.js').QuizAikenImportResult | null} */ (null)
  );

  const shouldPersistDraft = Boolean(persistDraft);

  const clearImportResult = useCallback(() => {
    setLastImportResult(null);
    setWorkflowPhase(AIKEN_IMPORT_WORKFLOW_PHASE.IDLE);
  }, []);

  const openFilePicker = useCallback(() => {
    if (disabled || importing) return;
    clearImportResult();
    inputRef.current?.click();
  }, [clearImportResult, disabled, importing]);

  const handleFileSelected = useCallback(
    async (event) => {
      const input = event.target;
      const file = input.files?.[0];
      input.value = '';
      if (!file || disabled || importing) return;

      const fileLabel = file.name;
      setImporting(true);
      setWorkflowPhase(AIKEN_IMPORT_WORKFLOW_PHASE.PREVIEW_RUNNING);
      setLastImportResult(null);

      const rejectFile = (outcome, saveError) => {
        const result = buildQuizAikenImportResult({
          fileLabel,
          outcome,
          workflowPhase:
            outcome === AIKEN_IMPORT_OUTCOME.FILE_REJECTED
              ? AIKEN_IMPORT_WORKFLOW_PHASE.VALIDATION_FAILED
              : AIKEN_IMPORT_WORKFLOW_PHASE.BACKEND_ERROR,
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
          saveError,
        });
        setLastImportResult(result);
        setWorkflowPhase(result.workflowPhase);
        toast.error(result.headline);
      };

      try {
        const fileError = validateAikenImportFile(file);
        if (fileError) {
          rejectFile(AIKEN_IMPORT_OUTCOME.FILE_REJECTED, fileError);
          return;
        }

        const content = await readTextFile(file);
        if (!content.trim()) {
          rejectFile(AIKEN_IMPORT_OUTCOME.EMPTY_FILE);
          return;
        }

        const token = getAdminToken();
        if (!token) {
          rejectFile(
            AIKEN_IMPORT_OUTCOME.BACKEND_ERROR,
            'You must be signed in to import questions.'
          );
          return;
        }

        let previewResponse;
        try {
          previewResponse = await adminApi.previewAikenImport(token, { content });
        } catch (error) {
          const saveError =
            error?.response?.data?.message ||
            error?.message ||
            'Could not preview the file. Check your connection and try again.';
          rejectFile(AIKEN_IMPORT_OUTCOME.BACKEND_ERROR, saveError);
          return;
        }

        const normalized = normalizeAikenPreviewResponse(previewResponse);
        const failures = mapImportEntriesToFailures(normalized.errors);
        const duplicateItems = mapImportEntriesToFailures(normalized.duplicateItems);
        const importedBatch = mapAikenQuestionsToQuizDraft(normalized.questions);
        const merged = mergeAikenIntoQuizDraft(existingQuestions, importedBatch);
        const importedCount = importedBatch.length;

        setWorkflowPhase(AIKEN_IMPORT_WORKFLOW_PHASE.PREVIEW_COMPLETE);

        const previewOutcome = resolvePreviewOutcome({
          diagnostics: normalized.diagnostics,
          failures,
          duplicateItems,
          importedCount,
        });

        if (importedCount === 0) {
          const result = buildQuizAikenImportResult({
            fileLabel,
            outcome: previewOutcome,
            workflowPhase:
              previewOutcome === AIKEN_IMPORT_OUTCOME.ALL_DUPLICATES
                ? AIKEN_IMPORT_WORKFLOW_PHASE.ALL_DUPLICATES
                : AIKEN_IMPORT_WORKFLOW_PHASE.VALIDATION_FAILED,
            diagnostics: normalized.diagnostics,
            failures,
            duplicateItems,
            importedCount: 0,
            draftSaveAttempted: false,
            draftSaved: false,
          });
          setLastImportResult(result);
          setWorkflowPhase(result.workflowPhase);
          toast.error(result.headline);
          return;
        }

        setWorkflowPhase(AIKEN_IMPORT_WORKFLOW_PHASE.READY_TO_IMPORT);

        let draftSaveAttempted = false;
        let draftSaved = !shouldPersistDraft;
        let saveError = '';
        let finalOutcome = previewOutcome;

        if (shouldPersistDraft && persistDraft) {
          draftSaveAttempted = true;
          setWorkflowPhase(AIKEN_IMPORT_WORKFLOW_PHASE.SAVING_DRAFT);

          const saveResult = await persistDraft(merged, sumQuizDraftPoints(merged));
          if (!saveResult.ok) {
            draftSaved = false;
            saveError = saveResult.offline
              ? AIKEN_DRAFT_SAVE_OFFLINE
              : saveResult.error || AIKEN_DRAFT_SAVE_FAILED;
            finalOutcome = saveResult.offline
              ? AIKEN_IMPORT_OUTCOME.DRAFT_SAVE_OFFLINE
              : AIKEN_IMPORT_OUTCOME.DRAFT_SAVE_FAILED;
            setWorkflowPhase(AIKEN_IMPORT_WORKFLOW_PHASE.DRAFT_SAVE_FAILED);
            toast.error(saveError);
          } else {
            draftSaved = true;
            setWorkflowPhase(AIKEN_IMPORT_WORKFLOW_PHASE.DRAFT_SAVED);
          }
        } else {
          setWorkflowPhase(AIKEN_IMPORT_WORKFLOW_PHASE.DRAFT_SAVED);
        }

        if (draftSaved || finalOutcome === AIKEN_IMPORT_OUTCOME.DRAFT_SAVE_OFFLINE) {
          onImported(merged);
        }

        const result = buildQuizAikenImportResult({
          fileLabel,
          outcome: finalOutcome,
          workflowPhase: draftSaved
            ? AIKEN_IMPORT_WORKFLOW_PHASE.DRAFT_SAVED
            : AIKEN_IMPORT_WORKFLOW_PHASE.DRAFT_SAVE_FAILED,
          diagnostics: normalized.diagnostics,
          failures,
          duplicateItems,
          importedCount,
          draftSaveAttempted,
          draftSaved,
          saveError,
        });
        setLastImportResult(result);

        if (draftSaved) {
          if (finalOutcome === AIKEN_IMPORT_OUTCOME.PARTIAL_SUCCESS) {
            toast.success(result.headline);
          } else if (finalOutcome !== AIKEN_IMPORT_OUTCOME.DRAFT_SAVE_OFFLINE) {
            toast.success(result.detail);
          }
        }
      } catch (error) {
        const saveError = error?.message || 'Import failed unexpectedly.';
        rejectFile(AIKEN_IMPORT_OUTCOME.BACKEND_ERROR, saveError);
      } finally {
        setImporting(false);
      }
    },
    [disabled, existingQuestions, importing, onImported, persistDraft, shouldPersistDraft]
  );

  return {
    importing,
    workflowPhase,
    lastImportResult,
    clearImportResult,
    openFilePicker,
    inputRef,
    handleFileSelected,
    accept: ACCEPT,
  };
}
