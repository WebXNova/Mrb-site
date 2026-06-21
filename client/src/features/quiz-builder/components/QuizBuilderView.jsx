import { useCallback, useEffect, useState } from 'react';
import { adminRoute } from '../../../config/adminPaths';
import { Link } from 'react-router-dom';
import { adminApi } from '../../../api/adminApi.js';
import { getAdminToken } from '../../../auth/session.js';
import TestWizardNav, { getTestWizardPreviousStep } from '../../../admin/components/TestWizardNav.jsx';
import { TestWizardProgress } from '../../../admin/components/TestWizardProgress.jsx';
import {
  getWizardStepEyebrow,
  TEST_WIZARD_BUTTONS,
} from '../../../admin/config/testWizardConfig.js';
import { useTestCompleteness } from '../../../admin/hooks/useTestCompleteness.js';
import PublishedTestReadOnlyBanner from '../../../admin/components/PublishedTestReadOnlyBanner.jsx';
import PublishedTestEditBanner from '../../../admin/components/PublishedTestEditBanner.jsx';
import { useTestReadOnly } from '../../../admin/hooks/useTestReadOnly.js';
import { useReadOnlyQuizActions } from '../hooks/useReadOnlyQuizActions.js';
import { testPageHeading, useTestTitle } from '../../../admin/hooks/useTestTitle.js';
import { useQuizBuilderState } from '../hooks/useQuizBuilderState.js';
import { useQuizDraftHydration } from '../hooks/useQuizDraftHydration.js';
import { useQuizDraftPersistence } from '../hooks/useQuizDraftPersistence.js';
import { useQuizUnsavedRouteGuard } from '../hooks/useQuizUnsavedRouteGuard.js';
import { useQuizAikenFileImport } from '../hooks/useQuizAikenFileImport.js';
import { AIKEN_DRAFT_LOAD_BUTTON, AIKEN_DRAFT_LOADING_BUTTON, AIKEN_DRAFT_SAVING_BUTTON } from '../utils/aikenDraftImportCopy.js';
import { AIKEN_IMPORT_WORKFLOW_PHASE } from '../utils/aikenImportWorkflow.js';
import QuizBuilderReadinessPanel from './QuizBuilderReadinessPanel.jsx';
import QuestionCardList from './QuestionCardList.jsx';
import QuizAikenImportSummary from './QuizAikenImportSummary.jsx';
import QuizBuilderEmptyState from './QuizBuilderEmptyState.jsx';
import QuizDraftRecoveryBanner from './QuizDraftRecoveryBanner.jsx';
import QuizDraftStatus from './QuizDraftStatus.jsx';

/**
 * Testmoz-style question list builder — shared by test quiz-builder and question bank routes.
 *
 * @param {{
 *   testId?: string | null,
 *   draftKey?: string,
 *   backTo?: string,
 *   backLabel?: string,
 *   pageTitle?: string,
 *   showWizard?: boolean,
 *   editPublished?: boolean,
 * }} props
 */
export default function QuizBuilderView({
  testId = null,
  draftKey,
  backTo,
  backLabel = TEST_WIZARD_BUTTONS.backToTests,
  pageTitle,
  showWizard = Boolean(testId),
  editPublished = false,
}) {
  const storageKey = draftKey || testId || 'question-bank';
  const testTitle = useTestTitle(testId);
  const { completeness, reload: reloadCompleteness } = useTestCompleteness(testId);
  const { readOnly: serverReadOnly, loading: readOnlyLoading } = useTestReadOnly(testId);
  const readOnly = editPublished ? false : serverReadOnly;
  const { state, actions, totalPoints } = useQuizBuilderState(storageKey, {
    skipLocalInit: Boolean(testId),
  });
  const safeActions = useReadOnlyQuizActions(actions, readOnly);
  const [serverVersion, setServerVersion] = useState(/** @type {number|null} */ (null));
  const [publishedEditUpdatedAt, setPublishedEditUpdatedAt] = useState(/** @type {string|null} */ (null));

  useEffect(() => {
    if (!editPublished || !testId) {
      setPublishedEditUpdatedAt(null);
      return undefined;
    }

    let cancelled = false;
    const token = getAdminToken();
    adminApi
      .getTest(token, testId)
      .then((response) => {
        if (!cancelled) setPublishedEditUpdatedAt(response?.data?.updatedAt ?? null);
      })
      .catch(() => {
        if (!cancelled) setPublishedEditUpdatedAt(null);
      });

    return () => {
      cancelled = true;
    };
  }, [editPublished, testId]);

  const { hydrationState, hydrationError, recovery, retryHydration } = useQuizDraftHydration({
    testId,
    storageKey,
    readOnly,
    editPublished,
    pauseUntilReady: readOnlyLoading,
    actions,
    onServerVersion: setServerVersion,
  });

  const syncEnabled = Boolean(testId) && hydrationState === 'ready';

  const { status: draftStatus, lastSavedAt, saveError, persistDraftImmediately } =
    useQuizDraftPersistence({
    storageKey,
    testId,
    state,
    totalPoints,
    onSaved: actions.resetDirty,
    readOnly,
    syncEnabled,
    serverVersion,
    onServerVersion: setServerVersion,
    onServerSaved: () => {
      reloadCompleteness();
      if (editPublished && testId) {
        const token = getAdminToken();
        adminApi.getTest(token, testId).then((response) => {
          setPublishedEditUpdatedAt(response?.data?.updatedAt ?? null);
        });
      }
    },
    needsServerSync: Boolean(recovery?.needsSync),
    publishedEditEnabled: editPublished,
    publishedEditUpdatedAt,
  });

  useQuizUnsavedRouteGuard(state.isDirty && !readOnly);

  const handleAikenImported = useCallback(
    (questions) => {
      actions.loadDraft(questions, { markDirty: false });
      requestAnimationFrame(() => {
        const cards = document.querySelectorAll('.qb-question-card');
        const last = cards[cards.length - 1];
        last?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    },
    [actions]
  );

  const handleSaveNow = useCallback(async () => {
    if (readOnly || !persistDraftImmediately) return;
    await persistDraftImmediately(state.questions, totalPoints);
  }, [persistDraftImmediately, readOnly, state.questions, totalPoints]);

  const aikenImportReady = Boolean(testId) && !readOnly && hydrationState === 'ready';
  const {
    importing: aikenImporting,
    workflowPhase: aikenWorkflowPhase,
    openFilePicker: openAikenFilePicker,
    inputRef: aikenInputRef,
    handleFileSelected: handleAikenFileSelected,
    accept: aikenAccept,
    lastImportResult,
    clearImportResult,
  } = useQuizAikenFileImport({
    existingQuestions: state.questions,
    onImported: handleAikenImported,
    persistDraft: aikenImportReady ? persistDraftImmediately : undefined,
    disabled: !aikenImportReady,
  });

  const questionCount = state.questions.length;
  const summary =
    questionCount === 0
      ? 'No questions added yet'
      : `${questionCount} multiple choice question${questionCount === 1 ? '' : 's'} · ${totalPoints} point${totalPoints === 1 ? '' : 's'} total`;

  const resolvedBackTo = backTo || adminRoute('tests');
  const resolvedTitle = pageTitle || (testId ? testPageHeading(testTitle, testId) : 'Questions');
  const previousStep = testId ? getTestWizardPreviousStep('questions', testId, editPublished) : null;
  const publishPath = testId && !editPublished ? adminRoute(`tests/${testId}/details`) : null;

  const handleAddQuestion = useCallback(() => {
    if (readOnly) return;
    safeActions.addQuestion();
    requestAnimationFrame(() => {
      const cards = document.querySelectorAll('.qb-question-card');
      const last = cards[cards.length - 1];
      last?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [readOnly, safeActions]);

  const showEmptyState = hydrationState === 'ready' && questionCount === 0;

  return (
    <div className="qb-page">
      <input
        ref={aikenInputRef}
        type="file"
        accept={aikenAccept}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleAikenFileSelected}
      />

      <header className="qb-shell">
        <div className="qb-shell__hero">
          <div className="qb-shell__intro">
            {showWizard && testId ? (
              <p className="qb-shell__eyebrow">{getWizardStepEyebrow('questions')}</p>
            ) : null}
            <h1 className="qb-shell__title">{resolvedTitle}</h1>
            <p className="qb-shell__summary">{summary}</p>
            {showWizard && testId && !readOnly ? (
              <p className="qb-shell__autosave-hint">Questions auto-save as you edit.</p>
            ) : null}
          </div>
          <div className="qb-shell__meta">
            <QuizDraftStatus status={draftStatus} lastSavedAt={lastSavedAt} saveError={saveError} />
          </div>
        </div>

        {readOnly ? <PublishedTestReadOnlyBanner /> : null}
        {editPublished ? <PublishedTestEditBanner testTitle={testTitle} /> : null}

        {testId && !readOnly ? (
          <QuizDraftRecoveryBanner
            recovery={recovery}
            hydrationError={hydrationError}
            hydrationState={hydrationState}
            onRetry={retryHydration}
          />
        ) : null}

        {showWizard && testId ? (
          <div className="qb-shell__nav">
            <TestWizardNav testId={testId} activeStep="questions" editMode={editPublished} />
          </div>
        ) : null}

        {lastImportResult ? (
          <QuizAikenImportSummary result={lastImportResult} onDismiss={clearImportResult} />
        ) : null}

        {!showEmptyState ? (
          <div className="qb-shell__toolbar">
            <div className="qb-shell__toolbar-primary">
              {!readOnly ? (
                <>
                  <button type="button" className="btn btn--primary" onClick={handleAddQuestion}>
                    {TEST_WIZARD_BUTTONS.addQuestion}
                  </button>
                  {testId ? (
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={openAikenFilePicker}
                      disabled={!aikenImportReady || aikenImporting}
                      aria-busy={aikenImporting}
                      title="Preview file contents, then save questions to this test draft"
                    >
                      {aikenImporting
                        ? aikenWorkflowPhase === AIKEN_IMPORT_WORKFLOW_PHASE.SAVING_DRAFT
                          ? AIKEN_DRAFT_SAVING_BUTTON
                          : AIKEN_DRAFT_LOADING_BUTTON
                        : AIKEN_DRAFT_LOAD_BUTTON}
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
            <div className="qb-shell__toolbar-secondary">
              {previousStep ? (
                <Link className="btn btn--ghost btn--sm" to={previousStep.to}>
                  ← {previousStep.label}
                </Link>
              ) : null}
              {publishPath ? (
                <Link className="btn btn--ghost btn--sm" to={publishPath}>
                  {TEST_WIZARD_BUTTONS.publish} →
                </Link>
              ) : null}
              <Link className="btn btn--ghost btn--sm" to={resolvedBackTo}>
                {backLabel}
              </Link>
            </div>
          </div>
        ) : (
          <div className="qb-shell__toolbar qb-shell__toolbar--minimal">
            <div className="qb-shell__toolbar-secondary">
              {previousStep ? (
                <Link className="btn btn--ghost btn--sm" to={previousStep.to}>
                  ← {previousStep.label}
                </Link>
              ) : null}
              <Link className="btn btn--ghost btn--sm" to={resolvedBackTo}>
                {backLabel}
              </Link>
            </div>
          </div>
        )}

        {showWizard && testId ? (
          <TestWizardProgress
            completeness={completeness}
            readOnly={readOnly}
            variant="compact"
            testId={testId}
            activeStep="questions"
          />
        ) : null}

        {showWizard && testId ? (
          <QuizBuilderReadinessPanel
            completeness={completeness}
            testId={testId}
            draftStatus={draftStatus}
            saveError={saveError}
            onSaveNow={handleSaveNow}
            isSaving={draftStatus === 'saving'}
            readOnly={readOnly}
          />
        ) : null}
      </header>

      <main className="qb-page__workspace" aria-label="Question list workspace">
        {hydrationState === 'ready' ? (
          showEmptyState ? (
            <QuizBuilderEmptyState
              onAdd={handleAddQuestion}
              onImport={aikenImportReady ? openAikenFilePicker : undefined}
              readOnly={readOnly}
            />
          ) : (
            <QuestionCardList questions={state.questions} actions={safeActions} disabled={readOnly} />
          )
        ) : hydrationState === 'error' ? (
          <p className="qb-page__summary">Fix the error above to continue editing questions.</p>
        ) : (
          <p className="qb-page__loading">Loading questions…</p>
        )}
      </main>
    </div>
  );
}
