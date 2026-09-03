import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStudentToken } from '../../../auth/session';
import { testTakingApi } from '../api/testTakingApi';
import {
  getAttemptErrorMessage,
  isAttemptExpiredError,
  isAttemptTokenError,
  isNetworkError,
  isTimeoutError,
} from '../utils/apiErrors';
import { loadAnswerDraft } from '../utils/answerDraft';
import {
  getAttemptSession,
  normalizeAttemptId,
  setAttemptSession,
} from '../utils/attemptSession';
import { logExamDebug, logExamError } from '../utils/examDebug';
import { normalizeAttemptQuestions, normalizeSavedAnswers } from '../utils/normalizeQuestion';
import {
  freeSessionPostSubmitPath,
  freeTestPath,
  isFreeGuestRuntime,
  markFreeSessionGuest,
} from '../../free-session/freeSessionNav';

/**
 * Exam load phases. Once TEST_READY is reached, unrelated renders (timer,
 * answers, question nav) must not return the page to TEST_INITIALIZING.
 */
export const TEST_LOAD_STATUS = {
  INITIALIZING: 'loading',
  READY: 'ready',
  SUBMITTING: 'finalizing',
  ERROR: 'error',
};

function readStoredSession(slug) {
  const stored = getAttemptSession(slug);
  return {
    attemptId: normalizeAttemptId(stored.attemptId),
    expiresAt: stored.expiresAt ?? null,
    accessKind: stored.accessKind ?? null,
  };
}

function examExitPath(slug) {
  return isFreeGuestRuntime(slug) ? freeTestPath(slug) : `/tests/${slug}`;
}

/**
 * Loads attempt start payload from the backend.
 * Attempt credential is HttpOnly cookie — not stored in JS.
 *
 * Load is keyed by slug + explicit retry nonce only. Writing sessionStorage,
 * rotating function identities, timer ticks, and answer updates must not
 * re-enter the full-page initializing state.
 */
export function useTestAttemptLoad(slug) {
  const navigate = useNavigate();
  const initialSession = readStoredSession(slug);

  const [payload, setPayload] = useState(null);
  const [answers, setAnswers] = useState({});
  const [attemptId, setAttemptId] = useState(initialSession.attemptId);
  const [expiresAt, setExpiresAt] = useState(initialSession.expiresAt);
  const [status, setStatus] = useState(TEST_LOAD_STATUS.INITIALIZING);
  const [error, setError] = useState('');
  const [loadNonce, setLoadNonce] = useState(0);

  const attemptIdRef = useRef(initialSession.attemptId);
  const payloadRef = useRef(null);
  const statusRef = useRef(status);
  const lastSlugRef = useRef(slug);
  const requestIdRef = useRef(0);

  statusRef.current = status;
  payloadRef.current = payload;

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const applyPayload = useCallback(
    (response, activeSession) => {
      const data = response?.data;
      const previous = readStoredSession(slug);
      const accessKind = activeSession.accessKind ?? previous.accessKind ?? null;

      if (isFreeGuestRuntime(slug)) {
        markFreeSessionGuest(slug, true);
      }

      if (data?.submitted || data?.attempt?.status === 'submitted') {
        const resultAvailable = data.resultAvailable !== false;
        setAttemptSession(slug, {
          attemptId: activeSession.attemptId,
          expiresAt: null,
          accessKind,
        });
        navigateRef.current(freeSessionPostSubmitPath(slug, { ...data, resultAvailable }), {
          replace: true,
          state: { attemptId: activeSession.attemptId, timedOut: false },
        });
        return;
      }

      const attemptExpiresAt = data?.attempt?.expiresAt ?? null;
      const resolvedAttemptId =
        normalizeAttemptId(data?.attempt?.id) ?? normalizeAttemptId(activeSession.attemptId);

      attemptIdRef.current = resolvedAttemptId;
      setAttemptId(resolvedAttemptId);

      setAttemptSession(slug, {
        attemptId: resolvedAttemptId,
        expiresAt: attemptExpiresAt,
        accessKind,
      });

      const serverAnswers = normalizeSavedAnswers(data?.savedAnswers);
      const localAnswers = loadAnswerDraft(slug, resolvedAttemptId);
      const merged = { ...serverAnswers, ...localAnswers };

      setExpiresAt(attemptExpiresAt);
      setPayload(data);
      setAnswers(merged);
      setStatus(TEST_LOAD_STATUS.READY);
      setError('');
      logExamDebug('test-fetch-success', {
        slug,
        attemptId: resolvedAttemptId,
        questionCount: Array.isArray(data?.test?.questions) ? data.test.questions.length : 0,
        expiresAt: attemptExpiresAt,
      });
    },
    [slug]
  );

  const applyPayloadRef = useRef(applyPayload);
  applyPayloadRef.current = applyPayload;

  const refreshSession = useCallback(async () => {
    if (!isFreeGuestRuntime(slug) && !getStudentToken()) return null;

    logExamDebug('attempt-resume-start', { slug });
    const response = await testTakingApi.resumeAttempt(slug);
    const data = response?.data;
    const nextAttemptId = normalizeAttemptId(data?.attemptId);
    if (!nextAttemptId) return null;

    const previous = readStoredSession(slug);
    const fresh = {
      attemptId: nextAttemptId,
      expiresAt: data.expiresAt ?? null,
      accessKind: previous.accessKind ?? (isFreeGuestRuntime(slug) ? 'free_standalone' : null),
    };
    setAttemptSession(slug, fresh);
    setAttemptId(fresh.attemptId);
    attemptIdRef.current = fresh.attemptId;
    logExamDebug('attempt-resume-success', { slug, attemptId: fresh.attemptId });
    return fresh;
  }, [slug]);

  const refreshSessionRef = useRef(refreshSession);
  refreshSessionRef.current = refreshSession;

  const retryLoad = useCallback(() => {
    setLoadNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const isCurrent = () => !cancelled && requestIdRef.current === requestId;

    if (lastSlugRef.current !== slug) {
      lastSlugRef.current = slug;
      payloadRef.current = null;
      setPayload(null);
      setAnswers({});
      setError('');
      setStatus(TEST_LOAD_STATUS.INITIALIZING);
    }

    async function submitExpiredAttempt(activeSession) {
      setStatus(TEST_LOAD_STATUS.SUBMITTING);
      setError('');
      logExamDebug('load-expired-autosubmit', { slug, attemptId: activeSession.attemptId });
      try {
        const response = await testTakingApi.submit(slug, activeSession.attemptId);
        if (!isCurrent()) return;
        const data = response?.data ?? response;
        navigateRef.current(freeSessionPostSubmitPath(slug, data), {
          replace: true,
          state: { attemptId: activeSession.attemptId, timedOut: true },
        });
      } catch (submitErr) {
        if (!isCurrent()) return;
        logExamError('load-expired-autosubmit-failed', submitErr, {
          slug,
          attemptId: activeSession.attemptId,
        });
        setError(
          getAttemptErrorMessage(
            submitErr,
            'Time ran out. Your test could not be submitted automatically. Please try again.'
          )
        );
        setStatus(TEST_LOAD_STATUS.ERROR);
      }
    }

    async function load() {
      const isRetry = loadNonce > 0;
      let stored = readStoredSession(slug);
      let activeAttemptId = stored.attemptId ?? normalizeAttemptId(attemptIdRef.current);

      if (!activeAttemptId) {
        try {
          const fresh = await refreshSessionRef.current();
          if (!isCurrent()) return;
          stored = readStoredSession(slug);
          activeAttemptId = normalizeAttemptId(fresh?.attemptId) ?? stored.attemptId;
        } catch (resumeErr) {
          logExamError('attempt-resume-failed', resumeErr, { slug });
        }
      }

      if (!activeAttemptId) {
        if (!isCurrent()) return;
        if (payloadRef.current) {
          logExamDebug('attempt-missing-session-ignored', { slug });
          return;
        }
        logExamDebug('attempt-missing-session', { slug });
        navigateRef.current(examExitPath(slug), { replace: true });
        return;
      }

      const alreadyReady =
        !isRetry &&
        payloadRef.current &&
        normalizeAttemptId(attemptIdRef.current) === activeAttemptId &&
        statusRef.current === TEST_LOAD_STATUS.READY;

      if (alreadyReady) {
        logExamDebug('test-fetch-skipped-ready', { slug, attemptId: activeAttemptId });
        return;
      }

      // Full-page skeleton only when there is no exam to keep on screen.
      if (!payloadRef.current) {
        setStatus(TEST_LOAD_STATUS.INITIALIZING);
      }
      setError('');
      logExamDebug('test-fetch-start', { slug, attemptId: activeAttemptId, isRetry });

      let activeSession = {
        attemptId: activeAttemptId,
        accessKind: stored.accessKind,
      };

      try {
        const response = await testTakingApi.loadStart(slug, activeAttemptId);
        if (!isCurrent()) return;
        applyPayloadRef.current(response, activeSession);
      } catch (err) {
        if (!isCurrent()) return;
        logExamError('test-fetch-error', err, { slug, attemptId: activeAttemptId });

        if (isAttemptExpiredError(err)) {
          await submitExpiredAttempt(activeSession);
          return;
        }

        if (isAttemptTokenError(err)) {
          try {
            const fresh = await refreshSessionRef.current();
            if (!fresh?.attemptId || !isCurrent()) {
              if (!isCurrent()) return;
              setError(getAttemptErrorMessage(err, 'Could not restore your test session.'));
              setStatus(TEST_LOAD_STATUS.ERROR);
              return;
            }
            activeSession = {
              attemptId: fresh.attemptId,
              accessKind: fresh.accessKind ?? stored.accessKind,
            };
            const response = await testTakingApi.loadStart(slug, fresh.attemptId);
            if (!isCurrent()) return;
            applyPayloadRef.current(response, activeSession);
            return;
          } catch (retryErr) {
            if (!isCurrent()) return;
            if (isAttemptExpiredError(retryErr)) {
              await submitExpiredAttempt(activeSession);
              return;
            }
            logExamError('test-fetch-error', retryErr, { slug, attemptId: activeAttemptId });
            setError(getAttemptErrorMessage(retryErr, 'Could not restore your test session.'));
            setStatus(TEST_LOAD_STATUS.ERROR);
            return;
          }
        }

        if (!isNetworkError(err) && !isTimeoutError(err) && !isAttemptTokenError(err)) {
          // Keep session so Retry works and the landing page cannot bounce us.
          logExamDebug('attempt-session-preserved-after-error', { slug, attemptId: activeAttemptId });
        }

        if (!payloadRef.current) {
          setError(getAttemptErrorMessage(err, 'Unable to load this test. Please try again.'));
          setStatus(TEST_LOAD_STATUS.ERROR);
        } else {
          setError(getAttemptErrorMessage(err, 'Unable to load this test. Please try again.'));
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [loadNonce, slug]);

  const questions = useMemo(
    () => normalizeAttemptQuestions(payload?.test?.questions),
    [payload]
  );

  const updateSessionExpiry = useCallback(
    (nextExpiresAt) => {
      if (!nextExpiresAt) return;
      setExpiresAt(nextExpiresAt);
      const previous = readStoredSession(slug);
      setAttemptSession(slug, {
        attemptId: attemptIdRef.current,
        expiresAt: nextExpiresAt,
        accessKind: previous.accessKind,
      });
    },
    [slug]
  );

  return {
    payload,
    questions,
    answers,
    setAnswers,
    attemptId,
    expiresAt,
    setExpiresAt: updateSessionExpiry,
    status,
    error,
    refreshSession,
    retryLoad,
  };
}
