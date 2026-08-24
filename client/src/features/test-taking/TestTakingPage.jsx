import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import AllQuestionsView from './components/AllQuestionsView';
import ExamHeader from './components/ExamHeader';
import MobilePaletteSheet from './components/MobilePaletteSheet';
import NavigationBar from './components/NavigationBar';
import OfflineBanner from './components/OfflineBanner';
import QuestionPalette from './components/QuestionPalette';
import QuestionPanel from './components/QuestionPanel';
import SectionDivider from './components/SectionDivider';
import SubmitConfirmModal from './components/SubmitConfirmModal';
import TestTakingError from './components/TestTakingError';
import TestTakingErrorBoundary from './components/TestTakingErrorBoundary';
import TestTakingSkeleton from './components/TestTakingSkeleton';
import { useAnswerAutosave, useExamTimer } from './hooks/useExamTimer';
import { useBeforeUnloadGuard, useOnlineStatus } from './hooks/useOnlineStatus';
import { useExamItemNavigation } from './hooks/useExamItemNavigation';
import { useSubmitAttempt } from './hooks/useSubmitAttempt';
import { useTestAttemptLoad } from './hooks/useTestAttemptLoad';
import {
  buildExamItems,
  questionIndexToItemIndex,
} from './utils/buildExamItems';
import { countAnswered } from './utils/questionStatus';
import {
  normalizeAttemptSections,
  normalizeTestDisplaySettings,
} from './utils/normalizeQuestion';
import './styles/test-taking.css';

function TestTakingContent() {
  const { slug } = useParams();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const autoSubmittedRef = useRef(false);
  const questionRefs = useRef(new Map());
  const [scrollCurrentId, setScrollCurrentId] = useState(null);
  const [scrollVisited, setScrollVisited] = useState(() => new Set());

  const {
    payload,
    questions,
    answers,
    setAnswers,
    attemptId,
    expiresAt,
    status,
    error,
    refreshSession,
  } = useTestAttemptLoad(slug);

  const sections = useMemo(
    () => normalizeAttemptSections(payload?.test?.sections),
    [payload?.test?.sections]
  );
  const { layoutMode, displayMode } = useMemo(
    () => normalizeTestDisplaySettings(payload?.test),
    [payload?.test]
  );
  // Flat tests with DB-default display_mode='all' historically used paginated UX in production.
  const effectiveDisplayMode = useMemo(() => {
    if (displayMode === 'all' && sections.length === 0) return 'one_per_page';
    return displayMode;
  }, [displayMode, sections.length]);
  const isScrollAll = effectiveDisplayMode === 'all';

  const questionIds = useMemo(() => questions.map((q) => q.id), [questions]);
  const examItems = useMemo(
    () => buildExamItems(questions, sections),
    [questions, sections]
  );

  const itemNav = useExamItemNavigation(examItems);

  useEffect(() => {
    if (!isScrollAll || !questionIds.length) return;
    setScrollCurrentId((prev) => prev ?? questionIds[0]);
    setScrollVisited((prev) => {
      const next = new Set(prev);
      next.add(questionIds[0]);
      return next;
    });
  }, [isScrollAll, questionIds]);

  const { executeSubmit, isSubmitting, submitError, clearSubmitError } = useSubmitAttempt({
    slug,
    attemptId,
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

  const { selectAnswer, saveStatus, saveError, retryFailedSaves, flushPendingSaves, resumeAutosave } =
    useAnswerAutosave({
      slug,
      attemptId,
      setAnswers,
      refreshSession,
      disabled: autosaveDisabled || !isOnline,
    });

  const handleAutoSubmit = useCallback(async () => {
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    setSubmitModalOpen(true);
    clearSubmitError();
    await flushPendingSaves();
    const result = await executeSubmit({ timedOut: true });
    if (!result?.ok) {
      autoSubmittedRef.current = false;
      resumeAutosave();
    }
  }, [clearSubmitError, executeSubmit, flushPendingSaves, resumeAutosave]);

  autoSubmitRef.current = handleAutoSubmit;

  useBeforeUnloadGuard(examReady && !timer.isExpired && !isSubmitting);

  useEffect(() => {
    if (isOnline && saveStatus === 'failed') {
      retryFailedSaves();
    }
  }, [isOnline, retryFailedSaves, saveStatus]);

  const answeredCount = countAnswered(questionIds, answers);
  const unansweredCount = Math.max(0, questions.length - answeredCount);

  const paletteCurrentId = isScrollAll
    ? scrollCurrentId
    : itemNav.currentQuestionId;
  const paletteVisited = isScrollAll ? scrollVisited : itemNav.visitedQuestionIds;
  const headerQuestionIndex = isScrollAll
    ? Math.max(0, questionIds.indexOf(scrollCurrentId ?? ''))
    : itemNav.questionIndex;

  const handleJump = useCallback(
    (questionIndex) => {
      if (uiLocked) return;

      if (isScrollAll) {
        const qid = questionIds[questionIndex];
        if (!qid) return;
        const el = questionRefs.current.get(String(qid));
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setScrollCurrentId(String(qid));
        setScrollVisited((prev) => {
          const next = new Set(prev);
          next.add(String(qid));
          return next;
        });
      } else {
        itemNav.goToItemIndex(questionIndexToItemIndex(examItems, questionIndex));
      }

      setPaletteOpen(false);
    },
    [examItems, isScrollAll, itemNav, questionIds, uiLocked]
  );

  const handleScrollQuestionVisible = useCallback((questionId) => {
    setScrollCurrentId(String(questionId));
    setScrollVisited((prev) => {
      if (prev.has(String(questionId))) return prev;
      const next = new Set(prev);
      next.add(String(questionId));
      return next;
    });
  }, []);

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
    const result = await executeSubmit({ timedOut: timer.isExpired });
    if (result?.ok) {
      setSubmitModalOpen(false);
    } else {
      resumeAutosave();
    }
  }, [clearSubmitError, executeSubmit, flushPendingSaves, isSubmitting, resumeAutosave, timer.isExpired]);

  const handleRetrySubmit = useCallback(async () => {
    if (isSubmitting) return;
    clearSubmitError();
    await flushPendingSaves();
    const result = await executeSubmit({ timedOut: timer.isExpired });
    if (!result?.ok) resumeAutosave();
  }, [clearSubmitError, executeSubmit, flushPendingSaves, isSubmitting, resumeAutosave, timer.isExpired]);

  const handleKeyDown = useCallback(
    (event) => {
      if (uiLocked || submitModalOpen || isScrollAll) return;
      if (event.target.closest('input, textarea, select, button')) return;

      if (event.key === 'ArrowLeft' && itemNav.canGoPrevious) {
        event.preventDefault();
        itemNav.goPrevious();
      } else if (event.key === 'ArrowRight' && itemNav.canGoNext) {
        event.preventDefault();
        itemNav.goNext();
      }
    },
    [isScrollAll, itemNav, submitModalOpen, uiLocked]
  );

  if (status === 'loading') {
    return <TestTakingSkeleton />;
  }

  if (status === 'error') {
    return <TestTakingError message={error} slug={slug} />;
  }

  const paletteProps = {
    questionIds,
    currentId: paletteCurrentId,
    answers,
    visited: paletteVisited,
    onJump: handleJump,
  };

  const renderPaginatedMain = () => {
    const item = itemNav.currentItem;
    if (!item) {
      return (
        <article className="tt-question tt-question--empty">
          <p>No questions available for this test.</p>
        </article>
      );
    }

    if (item.type === 'section') {
      return (
        <>
          <SectionDivider
            section={item.section}
            showContinue
            onContinue={itemNav.goNext}
            disabled={uiLocked}
          />
          <div className="tt-nav-wrap">
            <nav className="tt-nav" aria-label="Section navigation">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={itemNav.goPrevious}
                disabled={!itemNav.canGoPrevious || uiLocked || isSubmitting}
              >
                Previous
              </button>
            </nav>
          </div>
        </>
      );
    }

    return (
      <>
        <QuestionPanel
          question={item.question}
          questionNumber={item.questionNumber}
          totalQuestions={questions.length}
          selectedOptionId={answers[item.question.id] ?? null}
          onSelectOption={selectAnswer}
          questionRef={itemNav.focusRef}
          layoutMode={layoutMode}
          disabled={autosaveDisabled}
        />
        <div className="tt-nav-wrap">
          <NavigationBar
            canGoPrevious={itemNav.canGoPrevious}
            canGoNext={itemNav.canGoNext}
            onPrevious={itemNav.goPrevious}
            onNext={itemNav.goNext}
            onSubmit={handleOpenSubmitModal}
            isSubmitting={isSubmitting}
            disabled={uiLocked}
          />
        </div>
      </>
    );
  };

  return (
    <div className={`tt-exam ${uiLocked ? 'tt-exam--locked' : ''}`} onKeyDown={handleKeyDown}>
      <OfflineBanner isOnline={isOnline} />

      <ExamHeader
        title={payload?.test?.title || 'Test'}
        currentIndex={headerQuestionIndex}
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
        displayMode={effectiveDisplayMode}
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
        <main className={`tt-exam__main ${isScrollAll ? 'tt-exam__main--scroll-all' : ''}`}>
          {isScrollAll ? (
            <>
              <AllQuestionsView
                examItems={examItems}
                totalQuestions={questions.length}
                answers={answers}
                onSelectOption={selectAnswer}
                layoutMode={layoutMode}
                disabled={autosaveDisabled}
                questionRefs={questionRefs}
                onQuestionVisible={handleScrollQuestionVisible}
              />
              <div className="tt-nav-wrap tt-nav-wrap--submit-only">
                <nav className="tt-nav" aria-label="Submit test">
                  <button
                    type="button"
                    className="btn btn--primary tt-nav__submit"
                    onClick={handleOpenSubmitModal}
                    disabled={uiLocked || isSubmitting}
                  >
                    Submit test
                  </button>
                </nav>
              </div>
            </>
          ) : (
            renderPaginatedMain()
          )}
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
        timedOut={timer.isExpired}
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
