import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './styles/test-taking.css';
import AllQuestionsView from './components/AllQuestionsView';
import ExamHeader from './components/ExamHeader';
import FullscreenGate, { FullscreenExitBanner } from './components/FullscreenGate';
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
import { useExamFullscreen, useExamPresenceWarning } from './hooks/useExamFocus';
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
import { isAllQuestionsDisplay } from '../../utils/testPresentation.js';
import { freeSessionPostSubmitPath } from '../free-session/freeSessionNav';
import { scrollQuestionIntoView } from './utils/examScroll';

function TestTakingContent() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const examRef = useRef(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [autoSubmitActive, setAutoSubmitActive] = useState(false);
  const autoSubmittedRef = useRef(false);
  const questionRefs = useRef(new Map());
  const [scrollCurrentId, setScrollCurrentId] = useState(null);
  const [scrollVisited, setScrollVisited] = useState(() => new Set());
  const [fullscreenBypass, setFullscreenBypass] = useState(false);

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
  const { displayMode, fullPageMode } = useMemo(
    () => normalizeTestDisplaySettings(payload?.test),
    [payload?.test]
  );
  const isScrollAll = isAllQuestionsDisplay(displayMode);

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

  const {
    isFullscreen,
    error: fullscreenError,
    supported: fullscreenSupported,
    hasEnteredOnce,
    enter: enterFullscreen,
    exit: exitFullscreen,
  } = useExamFullscreen(examRef, { required: fullPageMode && examReady });
  const uiLocked = isSubmitting || submitModalOpen;
  const handleIntegrityBlocked = useCallback(
    (payload) => {
      const navState = { attemptId, timedOut: false };
      navigate(freeSessionPostSubmitPath(slug, payload), { replace: true, state: navState });
    },
    [attemptId, navigate, slug]
  );

  const presence = useExamPresenceWarning({
    enabled: examReady && !timer.isExpired && !isSubmitting,
    slug,
    attemptId,
    onBlocked: handleIntegrityBlocked,
  });
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
    setAutoSubmitActive(true);
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
    if (isFullscreen && examRef.current) {
      examRef.current.focus({ preventScroll: true });
    }
  }, [isFullscreen]);

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
        scrollQuestionIntoView(el, examRef.current);
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
    if (isSubmitting || autoSubmitActive) return;
    clearSubmitError();
    setSubmitModalOpen(true);
  }, [autoSubmitActive, clearSubmitError, isSubmitting]);

  const handleContinueTest = useCallback(() => {
    if (isSubmitting || autoSubmitActive) return;
    clearSubmitError();
    setSubmitModalOpen(false);
  }, [autoSubmitActive, clearSubmitError, isSubmitting]);

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
      if (uiLocked || submitModalOpen) return;
      if (event.target.closest('input, textarea, select, button')) return;

      if (isScrollAll) {
        const idx = Math.max(0, questionIds.indexOf(scrollCurrentId ?? ''));
        if (event.key === 'ArrowLeft' && idx > 0) {
          event.preventDefault();
          handleJump(idx - 1);
        } else if (event.key === 'ArrowRight' && idx < questionIds.length - 1) {
          event.preventDefault();
          handleJump(idx + 1);
        }
        return;
      }

      if (event.key === 'ArrowLeft' && itemNav.canGoPrevious) {
        event.preventDefault();
        itemNav.goPrevious();
      } else if (event.key === 'ArrowRight' && itemNav.canGoNext) {
        event.preventDefault();
        itemNav.goNext();
      }
    },
    [handleJump, isScrollAll, itemNav, questionIds, scrollCurrentId, submitModalOpen, uiLocked]
  );

  if (status === 'loading') {
    return <TestTakingSkeleton />;
  }

  if (status === 'error') {
    return <TestTakingError message={error} slug={slug} />;
  }

  const needsFullscreenGate =
    fullPageMode && status === 'ready' && !isFullscreen && !fullscreenBypass && !hasEnteredOnce;
  const showFullscreenExitBanner =
    fullPageMode && status === 'ready' && !isFullscreen && !fullscreenBypass && hasEnteredOnce;
  const navProgressLabel =
    questions.length > 0
      ? `Question ${headerQuestionIndex + 1} of ${questions.length}`
      : '';
  const canGoPreviousQuestion = headerQuestionIndex > 0;
  const canGoNextQuestion = headerQuestionIndex < questions.length - 1;
  const examClassName = [
    'tt-exam',
    isScrollAll ? 'tt-exam--all' : 'tt-exam--one-per-page',
    uiLocked ? 'tt-exam--locked' : '',
    isFullscreen ? 'tt-exam--is-fullscreen' : '',
    needsFullscreenGate ? 'tt-exam--needs-fs' : '',
  ]
    .filter(Boolean)
    .join(' ');

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
            progressLabel={navProgressLabel}
          />
        </div>
      </>
    );
  };

  return (
    <div
      ref={examRef}
      className={examClassName}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
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
        displayMode={displayMode}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => (isFullscreen ? exitFullscreen() : enterFullscreen())}
      />

      <FullscreenGate
        open={needsFullscreenGate}
        error={fullscreenError}
        onEnter={enterFullscreen}
        onContinueWithout={
          !fullscreenSupported || fullscreenError
            ? () => setFullscreenBypass(true)
            : undefined
        }
      />

      <FullscreenExitBanner open={showFullscreenExitBanner} onEnter={enterFullscreen} />

      {fullscreenError && !needsFullscreenGate ? (
        <p className="tt-banner tt-banner--warn" role="status">
          {fullscreenError}
        </p>
      ) : null}

      {presence.visible && presence.message ? (
        <div className="tt-banner tt-banner--warn tt-banner--presence" role="alert">
          <p>{presence.message}</p>
          {!presence.blocked ? (
            <button type="button" className="tt-banner__dismiss" onClick={presence.dismiss}>
              Continue test
            </button>
          ) : null}
        </div>
      ) : null}

      {submitError && !submitModalOpen ? (
        <p className="tt-banner tt-banner--error" role="alert">
          {submitError}
        </p>
      ) : null}

      {timer.isExpired && (isSubmitting || autoSubmitActive) ? (
        <p className="tt-banner tt-banner--warn" role="status">
          Time is up. Your test is being submitted.
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
                disabled={autosaveDisabled}
                questionRefs={questionRefs}
                onQuestionVisible={handleScrollQuestionVisible}
                scrollRootRef={examRef}
                isFullscreen={isFullscreen}
              />
              <div className="tt-nav-wrap">
                <NavigationBar
                  canGoPrevious={canGoPreviousQuestion}
                  canGoNext={canGoNextQuestion}
                  onPrevious={() => handleJump(headerQuestionIndex - 1)}
                  onNext={() => handleJump(headerQuestionIndex + 1)}
                  onSubmit={handleOpenSubmitModal}
                  isSubmitting={isSubmitting}
                  disabled={uiLocked}
                  progressLabel={navProgressLabel}
                />
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
        timedOut={timer.isExpired || autoSubmitActive}
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
