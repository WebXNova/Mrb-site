import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import ExamHeader from './components/ExamHeader';
import MobilePaletteSheet from './components/MobilePaletteSheet';
import NavigationBar from './components/NavigationBar';
import OfflineBanner from './components/OfflineBanner';
import QuestionPalette from './components/QuestionPalette';
import QuestionPanel from './components/QuestionPanel';
import SubmitConfirmModal from './components/SubmitConfirmModal';
import TestTakingError from './components/TestTakingError';
import TestTakingErrorBoundary from './components/TestTakingErrorBoundary';
import TestTakingSkeleton from './components/TestTakingSkeleton';
import { useAnswerAutosave, useExamTimer } from './hooks/useExamTimer';
import { useBeforeUnloadGuard, useOnlineStatus } from './hooks/useOnlineStatus';
import { useQuestionNavigation } from './hooks/useQuestionNavigation';
import { useSubmitAttempt } from './hooks/useSubmitAttempt';
import { useTestAttemptLoad } from './hooks/useTestAttemptLoad';
import { countAnswered } from './utils/questionStatus';
import './styles/test-taking.css';

function TestTakingContent() {
  const { slug } = useParams();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const autoSubmittedRef = useRef(false);

  const {
    payload,
    questions,
    answers,
    setAnswers,
    attemptId,
    attemptToken,
    expiresAt,
    status,
    error,
    updateToken,
    refreshSession,
  } = useTestAttemptLoad(slug);

  const questionIds = useMemo(() => questions.map((q) => q.id), [questions]);
  const questionsById = useMemo(() => {
    const map = new Map();
    for (const q of questions) map.set(q.id, q);
    return map;
  }, [questions]);

  const {
    currentIndex,
    currentId,
    visited,
    questionRef,
    goToIndex,
    goPrevious,
    goNext,
    canGoPrevious,
    canGoNext,
  } = useQuestionNavigation(questionIds);

  const { executeSubmit, isSubmitting, submitError, clearSubmitError } = useSubmitAttempt({
    slug,
    attemptId,
    attemptToken,
    updateToken,
    refreshSession,
  });

  const isOnline = useOnlineStatus();
  const examReady = status === 'ready' && Boolean(expiresAt);

  const autoSubmitRef = useRef(null);
  const timer = useExamTimer(expiresAt, {
    enabled: examReady,
    onExpire: () => autoSubmitRef.current?.(),
  });

  const uiLocked = isSubmitting || submitModalOpen;
  const autosaveDisabled = !examReady || timer.isExpired || uiLocked;

  const { selectAnswer, saveStatus, saveError, retryFailedSaves, flushPendingSaves } =
    useAnswerAutosave({
      slug,
      attemptId,
      attemptToken,
      setAnswers,
      updateToken,
      refreshSession,
      disabled: autosaveDisabled || !isOnline,
    });

  const handleAutoSubmit = useCallback(async () => {
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    setSubmitModalOpen(false);
    clearSubmitError();
    await flushPendingSaves();
    await executeSubmit();
  }, [clearSubmitError, executeSubmit, flushPendingSaves]);

  autoSubmitRef.current = handleAutoSubmit;

  useBeforeUnloadGuard(examReady && !timer.isExpired && !isSubmitting);

  useEffect(() => {
    if (isOnline && saveStatus === 'failed') {
      retryFailedSaves();
    }
  }, [isOnline, retryFailedSaves, saveStatus]);

  const currentQuestion = currentId ? questionsById.get(currentId) : null;
  const answeredCount = countAnswered(questionIds, answers);
  const unansweredCount = Math.max(0, questions.length - answeredCount);

  const handleJump = useCallback(
    (index) => {
      if (uiLocked) return;
      goToIndex(index);
      setPaletteOpen(false);
    },
    [goToIndex, uiLocked]
  );

  const handleOpenSubmitModal = useCallback(() => {
    if (isSubmitting) return;
    clearSubmitError();
    setSubmitModalOpen(true);
  }, [clearSubmitError, isSubmitting]);

  const handleContinueTest = useCallback(() => {
    if (isSubmitting) return;
    clearSubmitError();
    setSubmitModalOpen(false);
  }, [clearSubmitError, isSubmitting]);

  const handleConfirmSubmit = useCallback(async () => {
    if (isSubmitting) return;
    clearSubmitError();
    await flushPendingSaves();
    const result = await executeSubmit();
    if (result?.ok) {
      setSubmitModalOpen(false);
    }
  }, [clearSubmitError, executeSubmit, flushPendingSaves, isSubmitting]);

  const handleRetrySubmit = useCallback(async () => {
    if (isSubmitting) return;
    clearSubmitError();
    await executeSubmit();
  }, [clearSubmitError, executeSubmit, isSubmitting]);

  const handleKeyDown = useCallback(
    (event) => {
      if (uiLocked || submitModalOpen) return;
      if (event.target.closest('input, textarea, select, button')) return;

      if (event.key === 'ArrowLeft' && canGoPrevious) {
        event.preventDefault();
        goPrevious();
      } else if (event.key === 'ArrowRight' && canGoNext) {
        event.preventDefault();
        goNext();
      }
    },
    [canGoNext, canGoPrevious, goNext, goPrevious, submitModalOpen, uiLocked]
  );

  if (status === 'loading') {
    return <TestTakingSkeleton />;
  }

  if (status === 'error') {
    return <TestTakingError message={error} slug={slug} />;
  }

  const paletteProps = {
    questionIds,
    currentId,
    answers,
    visited,
    onJump: handleJump,
  };

  return (
    <div className={`tt-exam ${uiLocked ? 'tt-exam--locked' : ''}`} onKeyDown={handleKeyDown}>
      <OfflineBanner isOnline={isOnline} />

      <ExamHeader
        title={payload?.test?.title || 'Test'}
        currentIndex={currentIndex}
        totalQuestions={questions.length}
        answeredCount={answeredCount}
        timerFormatted={timer.formatted}
        isLowTime={timer.isLowTime}
        isCritical={timer.isCritical}
        isExpired={timer.isExpired}
        saveStatus={saveStatus}
        saveError={saveError}
        onRetrySave={retryFailedSaves}
        onOpenPalette={() => !uiLocked && setPaletteOpen(true)}
        showPaletteToggle
      />

      {submitError && !submitModalOpen ? (
        <p className="tt-banner tt-banner--error" role="alert">
          {submitError}
        </p>
      ) : null}

      {timer.isExpired && isSubmitting ? (
        <p className="tt-banner tt-banner--warn" role="status">
          Time is up. Submitting your test…
        </p>
      ) : null}

      <div className="tt-exam__body">
        <main className="tt-exam__main">
          <QuestionPanel
            question={currentQuestion}
            questionNumber={currentIndex + 1}
            totalQuestions={questions.length}
            selectedOptionId={currentId ? answers[currentId] ?? null : null}
            onSelectOption={selectAnswer}
            questionRef={questionRef}
            disabled={autosaveDisabled}
          />

          <NavigationBar
            canGoPrevious={canGoPrevious}
            canGoNext={canGoNext}
            onPrevious={goPrevious}
            onNext={goNext}
            onSubmit={handleOpenSubmitModal}
            isSubmitting={isSubmitting}
            disabled={uiLocked}
          />
        </main>

        <QuestionPalette {...paletteProps} className="tt-exam__sidebar" />
      </div>

      <MobilePaletteSheet
        isOpen={paletteOpen && !uiLocked}
        onClose={() => setPaletteOpen(false)}
      >
        <QuestionPalette {...paletteProps} className="tt-palette--sheet" />
      </MobilePaletteSheet>

      <SubmitConfirmModal
        isOpen={submitModalOpen}
        totalQuestions={questions.length}
        answeredCount={answeredCount}
        unansweredCount={unansweredCount}
        isSubmitting={isSubmitting}
        submitError={submitError}
        onContinue={handleContinueTest}
        onConfirm={handleConfirmSubmit}
        onRetry={handleRetrySubmit}
      />
    </div>
  );
}

export default function TestTakingPage() {
  return (
    <TestTakingErrorBoundary>
      <TestTakingContent />
    </TestTakingErrorBoundary>
  );
}
