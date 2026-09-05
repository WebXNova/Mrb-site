import { useCallback, useEffect, useRef, useState } from 'react';
import { testTakingApi } from '../api/testTakingApi';
import { getAttemptErrorMessage, isAttemptTokenError } from '../utils/apiErrors';
import { loadAnswerDraft, saveAnswerDraft } from '../utils/answerDraft';
import { logExamError } from '../utils/examDebug';
import { computeRemainingSeconds, formatExamTime } from '../utils/formatTime';
import { withTimeout } from '../utils/withTimeout';

const SAVE_DEBOUNCE_MS = 450;
const SAVE_TIMEOUT_MS = 30_000;
const TIMER_TICK_MS = 250;
const LOW_TIME_SECONDS = 600;
const CRITICAL_TIME_SECONDS = 120;

/**
 * Timer driven exclusively by server-provided expires_at.
 * Canonical exam clock for slug test-taking (there is no useTestTimer hook).
 * Remaining time is always END_TIME - CURRENT_TIME, never a decrementing counter.
 */
export function useExamTimer(expiresAtIso, { onExpire, enabled = true } = {}) {
  const expiresRef = useRef(expiresAtIso);
  const onExpireRef = useRef(onExpire);
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    expiresAtIso ? computeRemainingSeconds(expiresAtIso) : null
  );
  const expiredRef = useRef(false);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const prev = expiresRef.current;
    expiresRef.current = expiresAtIso;

    if (!expiresAtIso) {
      setSecondsRemaining(null);
      return;
    }

    const remaining = computeRemainingSeconds(expiresAtIso);
    setSecondsRemaining(remaining);
    if (prev !== expiresAtIso && remaining > 0) {
      expiredRef.current = false;
    }
  }, [expiresAtIso]);

  useEffect(() => {
    if (!enabled || !expiresRef.current) return undefined;

    const tick = () => {
      const remaining = computeRemainingSeconds(expiresRef.current);
      setSecondsRemaining(remaining);

      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current?.();
      }
    };

    tick();
    const intervalId = window.setInterval(tick, TIMER_TICK_MS);
    const resync = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      tick();
    };
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('focus', resync);
    window.addEventListener('pageshow', resync);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('focus', resync);
      window.removeEventListener('pageshow', resync);
    };
  }, [enabled]);

  const formatted = secondsRemaining == null ? '—' : formatExamTime(secondsRemaining);
  const isLowTime =
    secondsRemaining != null && secondsRemaining > 0 && secondsRemaining <= LOW_TIME_SECONDS;
  const isCritical =
    secondsRemaining != null && secondsRemaining > 0 && secondsRemaining <= CRITICAL_TIME_SECONDS;
  const isExpired = Boolean(enabled && secondsRemaining != null && secondsRemaining <= 0);

  return {
    secondsRemaining,
    formatted,
    isLowTime,
    isCritical,
    isExpired,
  };
}

/**
 * Debounced autosave with optimistic UI and save status feedback.
 */
export function useAnswerAutosave({
  slug,
  attemptId,
  setAnswers,
  refreshSession,
  disabled = false,
}) {
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveError, setSaveError] = useState('');
  const timersRef = useRef(new Map());
  const pendingRef = useRef(new Map());
  const inFlightRef = useRef(false);
  const inFlightPromiseRef = useRef(/** @type {Promise<void>|null} */ (null));
  const submitLockRef = useRef(false);
  const hydratedRef = useRef(false);
  const answersRef = useRef({});

  const persistDraft = useCallback(
    (nextAnswers) => {
      answersRef.current = nextAnswers;
      saveAnswerDraft(slug, attemptId, nextAnswers);
    },
    [attemptId, slug]
  );

  const flushQueue = useCallback(async () => {
    if (inFlightPromiseRef.current) {
      await inFlightPromiseRef.current;
      if (pendingRef.current.size === 0) return;
    }
    if (pendingRef.current.size === 0) return;
    if (disabled && !submitLockRef.current) return;
    if (!slug || attemptId == null || attemptId === '') return;

    const work = (async () => {
      inFlightRef.current = true;
      setSaveStatus('saving');
      setSaveError('');

      const entries = Array.from(pendingRef.current.entries());
      pendingRef.current.clear();

      try {
        for (const [questionId, selectedOption] of entries) {
          await withTimeout(
            testTakingApi.saveAnswer(slug, attemptId, {
              questionId: Number(questionId),
              selectedOption: String(selectedOption),
            }),
            SAVE_TIMEOUT_MS,
            'Save timed out'
          );
        }
        setSaveStatus('saved');
      } catch (err) {
        for (const [questionId, selectedOption] of entries) {
          pendingRef.current.set(questionId, selectedOption);
        }
        logExamError('autosave-failed', err, { slug, attemptId });

        if (isAttemptTokenError(err) && !submitLockRef.current) {
          try {
            const fresh = await refreshSession();
            if (fresh?.attemptId) {
              return;
            }
          } catch {
            // fall through to failed state
          }
        }

        setSaveStatus('failed');
        setSaveError(getAttemptErrorMessage(err, 'Auto-save failed.'));
      } finally {
        inFlightRef.current = false;
      }
    })();

    inFlightPromiseRef.current = work;
    try {
      await work;
    } finally {
      if (inFlightPromiseRef.current === work) {
        inFlightPromiseRef.current = null;
      }
    }

    if (pendingRef.current.size > 0 && !submitLockRef.current && !disabled) {
      window.setTimeout(() => {
        void flushQueue();
      }, SAVE_DEBOUNCE_MS);
    }
  }, [attemptId, disabled, refreshSession, slug]);

  const scheduleSave = useCallback(
    (questionId, selectedOption) => {
      if (disabled || submitLockRef.current) return;

      pendingRef.current.set(String(questionId), selectedOption);

      const key = String(questionId);
      if (timersRef.current.has(key)) {
        window.clearTimeout(timersRef.current.get(key));
      }

      timersRef.current.set(
        key,
        window.setTimeout(() => {
          timersRef.current.delete(key);
          flushQueue();
        }, SAVE_DEBOUNCE_MS)
      );
    },
    [disabled, flushQueue]
  );

  const selectAnswer = useCallback(
    (questionId, selectedOption) => {
      if (disabled || submitLockRef.current) return;
      const qid = String(questionId);
      const option = String(selectedOption);
      setAnswers((prev) => {
        const next = { ...prev, [qid]: option };
        persistDraft(next);
        return next;
      });
      scheduleSave(qid, option);
    },
    [disabled, persistDraft, scheduleSave, setAnswers]
  );

  useEffect(() => {
    if (!attemptId || hydratedRef.current) return;
    hydratedRef.current = true;
    const draft = loadAnswerDraft(slug, attemptId);
    for (const [questionId, selectedOption] of Object.entries(draft)) {
      if (selectedOption) pendingRef.current.set(String(questionId), String(selectedOption));
    }
  }, [attemptId, slug]);

  useEffect(() => {
    if (disabled || submitLockRef.current) return;
    if (pendingRef.current.size > 0) {
      void flushQueue();
    }
  }, [disabled, flushQueue]);

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer);
      }
      timersRef.current.clear();
    },
    []
  );

  const hasPendingSaves = pendingRef.current.size > 0 || inFlightRef.current;

  const resumeAutosave = useCallback(() => {
    submitLockRef.current = false;
  }, []);

  const flushPendingSaves = useCallback(async () => {
    submitLockRef.current = true;
    for (const timer of timersRef.current.values()) {
      window.clearTimeout(timer);
    }
    timersRef.current.clear();

    if (inFlightPromiseRef.current) {
      await inFlightPromiseRef.current;
    }
    if (pendingRef.current.size > 0) {
      await flushQueue();
    }
  }, [flushQueue]);

  return {
    selectAnswer,
    saveStatus,
    saveError,
    hasPendingSaves,
    retryFailedSaves: flushQueue,
    flushPendingSaves,
    resumeAutosave,
  };
}
