import { useCallback, useEffect, useRef, useState } from 'react';
import { testTakingApi } from '../api/testTakingApi';
import { getAttemptErrorMessage, isAttemptTokenError } from '../utils/apiErrors';
import { computeRemainingSeconds, formatExamTime } from '../utils/formatTime';

const SAVE_DEBOUNCE_MS = 450;

/**
 * Timer driven exclusively by server-provided expires_at.
 * Canonical exam clock for slug test-taking (there is no useTestTimer hook).
 */
export function useExamTimer(expiresAtIso, { onExpire, enabled = true } = {}) {
  const expiresRef = useRef(expiresAtIso);
  const onExpireRef = useRef(onExpire);
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    enabled ? computeRemainingSeconds(expiresAtIso) : null
  );
  const expiredRef = useRef(false);

  useEffect(() => {
    expiresRef.current = expiresAtIso;
    if (enabled && expiresAtIso) {
      setSecondsRemaining(computeRemainingSeconds(expiresAtIso));
      expiredRef.current = false;
    }
  }, [enabled, expiresAtIso]);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

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
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [enabled, expiresAtIso]);

  const formatted = secondsRemaining == null ? '--:--' : formatExamTime(secondsRemaining);
  const isLowTime = secondsRemaining != null && secondsRemaining > 0 && secondsRemaining <= 300;
  const isCritical = secondsRemaining != null && secondsRemaining > 0 && secondsRemaining <= 60;
  const isExpired = secondsRemaining === 0;

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

  const flushQueue = useCallback(async () => {
    if (inFlightPromiseRef.current) {
      await inFlightPromiseRef.current;
      if (pendingRef.current.size === 0) return;
    }
    if (pendingRef.current.size === 0) return;
    if (disabled && !submitLockRef.current) return;

    const work = (async () => {
      inFlightRef.current = true;
      setSaveStatus('saving');
      setSaveError('');

      const entries = Array.from(pendingRef.current.entries());
      pendingRef.current.clear();

      try {
        for (const [questionId, selectedOption] of entries) {
          await testTakingApi.saveAnswer(slug, attemptId, {
            questionId: Number(questionId),
            selectedOption: String(selectedOption),
          });
        }
        setSaveStatus('saved');
      } catch (err) {
        for (const [questionId, selectedOption] of entries) {
          pendingRef.current.set(questionId, selectedOption);
        }

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
      const qid = String(questionId);
      setAnswers((prev) => ({ ...prev, [qid]: String(selectedOption) }));
      scheduleSave(qid, selectedOption);
    },
    [scheduleSave, setAnswers]
  );

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
    selectAnswer,
    saveStatus,
    saveError,
    hasPendingSaves,
    retryFailedSaves: flushQueue,
    retryFailedSaves: flushQueue,
    flushPendingSaves,
    resumeAutosave,
  };
}
