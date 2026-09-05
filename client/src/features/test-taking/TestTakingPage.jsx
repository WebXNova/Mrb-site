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
import { applyExamShellDocumentClass, scrollQuestionIntoView } from './utils/examScroll';

function ExamStatusScreen({ title, message }) {
  return (
    <div className="tt-state" role="status" aria-live="polite">
      <h2 className="tt-state__title">{title}</h2>
      <p className="tt-state__message">{message}</p>
    </div>
  );
}

function TestTakingContent() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const examRef = useRef(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
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
    retryLoad,
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
    applyExamShellDocumentClass(true);
    return () => applyExamShellDocumentClass(false);
  }, []);

  useEffect(() => {
    if (!isScrollAll || !questionIds.length) return;
    const firstId = questionIds[0];
    setScrollCurrentId((prev) => prev ?? firstId);
    setScrollVisited((prev) => {
      if (prev.has(firstId)) return prev;
      const next = new Set(prev);
      next.add(firstId);
      return next;
    });
  }, [isScrollAll, questionIds]);

  const { executeSubmit, isSubmitting, isSubmitSuccess, submitStatus, submitError, clearSubmitError } =
    useSubmitAttempt({
      slug,
      attemptId,
    });

  const isOnline = useOnlineStatus();
  const hasLoadedExam = status === 'ready' && questions.length > 0;
  const examReady = hasLoadedExam;
  const timerEnabled = examReady && Boolean(expiresAt) && !isSubmitSuccess;

  const autoSubmitRef = useRef(null);
  const timer = useExamTimer(expiresAt, {
    enabled: timerEnabled,
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

  const uiLocked = isSubmitting || isSubmitSuccess;
  const handleIntegrityBlocked = useCallback(
    (blockedPayload) => {
      const navState = { attemptId, timedOut: false };
      navigate(freeSessionPostSubmitPath(slug, blockedPayload), { replace: true, state: navState });
    },
    [attemptId, navigate, slug]
  );

  const presence = useExamPresenceWarning({
    enabled: examReady && !timer.isExpired && !isSubmitting && !isSubmitSuccess,
    slug,
    attemptId,
    onBlocked: handleIntegrityBlocked,
  });
  const answersLocked = !examReady || timer.isExpired || uiLocked || autoSubmitActive;
  const autosaveDisabled = answersLocked;

  const { selectAnswer, saveStatus, saveError, retryFailedSaves, flushPendingSaves, resumeAutosave } =
    useAnswerAutosave({
      slug,
      attemptId,
      setAnswers,
      refreshSession,
      disabled: autosaveDisabled,
    });

  const handleAutoSubmit = useCallback(async () => {
    if (autoSubmittedRef.current || isSubmitSuccess) return;
    autoSubmittedRef.current = true;
    setAutoSubmitActive(true);
    setSubmitModalOpen(true);
    clearSubmitError();
    const result = await executeSubmit({ timedOut: true, prepare: flushPendingSaves });
    if (!result?.ok) {
      autoSubmittedRef.current = false;
      setAutoSubmitActive(false);
      resumeAutosave();
    }
  }, [clearSubmitError, executeSubmit, flushPendingSaves, isSubmitSuccess, resumeAutosave]);

  autoSubmitRef.current = handleAutoSubmit;

  useBeforeUnloadGuard(examReady && !timer.isExpired && !isSubmitting && !isSubmitSuccess);

  useEffect(() => {
    if (isFullscreen && examRef.current) {
      examRef.current.focus({ preventScroll: true });
    }
  }, [isFullscreen]);

  useEffect(() => {
    if (isOnline) {
      retryFailedSaves();
    }
  }, [isOnline, retryFailedSaves]);

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
          const id = String(qid);
          if (prev.has(id)) return prev;
          const next = new Set(prev);
          next.add(id);
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

  const handleOpenSubmitModal = useCallback(
    (event) => {
      event?.preventDefault?.();
      if (isSubmitting || isSubmitSuccess || autoSubmitActive) return;
      if (!attemptId || !questions.length) return;
      clearSubmitError();
      setSubmitModalOpen(true);
    },
    [attemptId, autoSubmitActive, clearSubmitError, isSubmitSuccess, isSubmitting, questions.length]
  );

  const handleContinueTest = useCallback(() => {
    if (isSubmitting || isSubmitSuccess || autoSubmitActive) return;
    clearSubmitError();
    setSubmitModalOpen(false);
  }, [autoSubmitActive, clearSubmitError, isSubmitSuccess, isSubmitting]);

  const handleConfirmSubmit = useCallback(async () => {
    if (isSubmitting || isSubmitSuccess) return;
    clearSubmitError();
    const result = await executeSubmit({
      timedOut: timer.isExpired,
      prepare: flushPendingSaves,
    });
    if (result?.ok) {
      setSubmitModalOpen(false);
    } else {
      resumeAutosave();
    }
  }, [
    clearSubmitError,
    executeSubmit,
    flushPendingSaves,
    isSubmitSuccess,
    isSubmitting,
    resumeAutosave,
    timer.isExpired,
  ]);

  const handleRetrySubmit = useCallback(async () => {
    if (isSubmitting || isSubmitSuccess) return;
    clearSubmitError();
    const result = await executeSubmit({
      timedOut: timer.isExpired || autoSubmitActive,
      prepare: flushPendingSaves,
    });
    if (!result?.ok) resumeAutosave();
  }, [
    autoSubmitActive,
    clearSubmitError,
    executeSubmit,
    flushPendingSaves,
    isSubmitSuccess,
    isSubmitting,
    resumeAutosave,
    timer.isExpired,
  ]);

  const handleKeyDown = useCallback(
    (event) => {
      if (uiLocked || submitModalOpen) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('input, textarea, select, button, [role="dialog"], [role="alertdialog"]')) {
        return;
      }

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

  if (status === 'loading' && !payload) {
    return <TestTakingSkeleton />;
  }

  if (status === 'finalizing') {
    return (
      <ExamStatusScreen
        title="Time is up"
        message="Time is up. Your test is being submitted..."
      />
    );
  }

  if (status === 'error') {
    return <TestTakingError message={error} slug={slug} onRetry={retryLoad} />;
  }

  if (status === 'ready' && questions.length === 0) {
    return (
      <TestTakingError
        message="This test has no questions to display. Please contact your instructor."
        slug={slug}
        onRetry={retryLoad}
      />
    );
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
    examTitle: payload?.test?.title || 'Test',
    subject: payload?.test?.subject,
    answeredCount,
    totalQuestions: questions.length,
  };

  const footerNav = (
    <NavigationBar
      canGoPrevious={isScrollAll ? canGoPreviousQuestion : itemNav.canGoPrevious}
      canGoNext={isScrollAll ? canGoNextQuestion : itemNav.canGoNext}
      onPrevious={
        isScrollAll ? () => handleJump(headerQuestionIndex - 1) : itemNav.goPrevious
      }
      onNext={isScrollAll ? () => handleJump(headerQuestionIndex + 1) : itemNav.goNext}
      onSubmit={handleOpenSubmitModal}
      isSubmitting={isSubmitting}
      submitStatus={submitStatus}
      disabled={uiLocked}
      progressLabel={navProgressLabel}
      answeredCount={answeredCount}
      unansweredCount={unansweredCount}
    />
  );

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
        <SectionDivider
          section={item.section}
          showContinue
          onContinue={itemNav.goNext}
          disabled={uiLocked}
        />
      );
    }

    return (
      <QuestionPanel
        question={item.question}
        questionNumber={item.questionNumber}
        totalQuestions={questions.length}
        selectedOptionId={answers[item.question.id] ?? null}
        onSelectOption={selectAnswer}
        questionRef={itemNav.focusRef}
        disabled={answersLocked}
      />
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
        subject={payload?.test?.subject}
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
        onOpenPalette={() => {
          if (uiLocked) return;
          setProgressOpen(false);
          setPaletteOpen(true);
        }}
        showPaletteToggle
        onOpenProgress={() => {
          if (uiLocked) return;
          setPaletteOpen(false);
          setProgressOpen(true);
        }}
        showProgressToggle
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
          Time is up. Your test is being submitted...
        </p>
      ) : null}

      {isSubmitSuccess ? (
        <p className="tt-banner tt-banner--warn" role="status">
          Calculating result...
        </p>
      ) : null}

      <div className="tt-exam__body">
        <main className={`tt-exam__main ${isScrollAll ? 'tt-exam__main--scroll-all' : ''}`}>
          {isScrollAll ? (
            <AllQuestionsView
              examItems={examItems}
              totalQuestions={questions.length}
              answers={answers}
              onSelectOption={selectAnswer}
              disabled={answersLocked}
              questionRefs={questionRefs}
              onQuestionVisible={handleScrollQuestionVisible}
              scrollRootRef={examRef}
              isFullscreen={isFullscreen}
            />
          ) : (
            renderPaginatedMain()
          )}
        </main>

        <QuestionPalette {...paletteProps} className="tt-exam__sidebar" />
      </div>

      <footer className="tt-exam__footer">{footerNav}</footer>

      <MobilePaletteSheet
        isOpen={paletteOpen && !uiLocked}
        onClose={() => setPaletteOpen(false)}
        title="Questions"
        ariaLabel="Question navigator"
      >
        <QuestionPalette {...paletteProps} className="tt-palette--sheet" />
      </MobilePaletteSheet>

      <MobilePaletteSheet
        isOpen={progressOpen && !uiLocked}
        onClose={() => setProgressOpen(false)}
        title="Progress"
        ariaLabel="Exam progress"
      >
        <div className="tt-progress-sheet">
          <p className="tt-palette__eyebrow">Exam progress</p>
          <p className="tt-progress-sheet__title">{payload?.test?.title || 'Test'}</p>
          {payload?.test?.subject ? (
            <p className="tt-progress-sheet__subject">{payload.test.subject}</p>
          ) : null}
          <dl className="tt-progress-sheet__facts">
            <div>
              <dt>Answered</dt>
              <dd>
                {answeredCount} / {questions.length}
              </dd>
            </div>
            <div>
              <dt>Remaining</dt>
              <dd>{unansweredCount}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{timer.formatted}</dd>
            </div>
          </dl>
        </div>
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
