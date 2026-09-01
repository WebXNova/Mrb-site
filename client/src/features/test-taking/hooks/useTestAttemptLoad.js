import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStudentToken } from '../../../auth/session';
import { testTakingApi } from '../api/testTakingApi';
import { getAttemptErrorMessage, isAttemptTokenError } from '../utils/apiErrors';
import {
  clearAttemptSession,
  getAttemptSession,
  setAttemptSession,
} from '../utils/attemptSession';
import { normalizeAttemptQuestions, normalizeSavedAnswers } from '../utils/normalizeQuestion';
import { freeSessionPostSubmitPath, freeTestPath, isFreeGuestRuntime } from '../../free-session/freeSessionNav';

/**
 * Loads attempt start payload from the backend.
 * Attempt credential is HttpOnly cookie — not stored in JS.
 */
export function useTestAttemptLoad(slug) {
  const navigate = useNavigate();
  const session = getAttemptSession(slug);

  const [payload, setPayload] = useState(null);
  const [answers, setAnswers] = useState({});
  const [expiresAt, setExpiresAt] = useState(session.expiresAt ?? null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  const attemptIdRef = useRef(session.attemptId);

    const applyPayload = useCallback(
    (response, activeSession) => {
      const data = response?.data;
      const previous = getAttemptSession(slug);
      const accessKind = activeSession.accessKind ?? previous.accessKind ?? null;

      if (data?.submitted || data?.attempt?.status === 'submitted') {
        const resultAvailable = data.resultAvailable !== false;
        setAttemptSession(slug, {
          attemptId: activeSession.attemptId,
          expiresAt: null,
          accessKind,
        });
        navigate(freeSessionPostSubmitPath(slug, { ...data, resultAvailable }), {
          replace: true,
          state: { attemptId: activeSession.attemptId, timedOut: false },
        });
        return;
      }

      const attemptExpiresAt = data?.attempt?.expiresAt ?? null;

      attemptIdRef.current = activeSession.attemptId;

      setAttemptSession(slug, {
        attemptId: activeSession.attemptId,
        expiresAt: attemptExpiresAt,
        accessKind,
      });

      setExpiresAt(attemptExpiresAt);
      setPayload(data);
      setAnswers(normalizeSavedAnswers(data?.savedAnswers));
      setStatus('ready');
      setError('');
    },
    [navigate, slug]
  );

  const refreshSession = useCallback(async () => {
    if (isFreeGuestRuntime(slug)) {
      const response = await testTakingApi.resumeAttempt(slug);
      const data = response?.data;
      if (!data?.attemptId) return null;
      const previous = getAttemptSession(slug);
      const fresh = {
        attemptId: data.attemptId,
        expiresAt: data.expiresAt ?? null,
        accessKind: previous.accessKind ?? 'free_standalone',
      };
      setAttemptSession(slug, fresh);
      return fresh;
    }

    const studentToken = getStudentToken();
    if (!studentToken) return null;

    const response = await testTakingApi.resumeAttempt(slug);
    const data = response?.data;
    if (!data?.attemptId) return null;

    const previous = getAttemptSession(slug);
    const fresh = {
      attemptId: data.attemptId,
      expiresAt: data.expiresAt ?? null,
      accessKind: previous.accessKind ?? null,
    };
    setAttemptSession(slug, fresh);
    return fresh;
  }, [slug]);

  useEffect(() => {
    if (!session.attemptId) {
      navigate(isFreeGuestRuntime(slug) ? freeTestPath(slug) : `/tests/${slug}`, { replace: true });
      return undefined;
    }

    let cancelled = false;

    async function load() {
      setStatus('loading');
      setError('');

      let activeSession = {
        attemptId: session.attemptId,
      };

      try {
        const response = await testTakingApi.loadStart(slug, activeSession.attemptId);
        if (cancelled) return;
        applyPayload(response, activeSession);
      } catch (err) {
        if (cancelled) return;

        if (isAttemptTokenError(err)) {
          try {
            const fresh = await refreshSession();
            if (fresh && !cancelled) {
              activeSession = fresh;
              const response = await testTakingApi.loadStart(slug, fresh.attemptId);
              if (cancelled) return;
              applyPayload(response, fresh);
              return;
            }
          } catch (retryErr) {
            if (!cancelled) {
              clearAttemptSession(slug);
              setError(getAttemptErrorMessage(retryErr, 'Could not restore your test session.'));
              setStatus('error');
            }
            return;
          }
        }

        clearAttemptSession(slug);
        setError(getAttemptErrorMessage(err, 'Unable to start test.'));
        setStatus('error');
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [applyPayload, navigate, refreshSession, session.attemptId, slug]);

  const questions = normalizeAttemptQuestions(payload?.test?.questions);

  const updateSessionExpiry = useCallback(
    (nextExpiresAt) => {
      if (!nextExpiresAt) return;
      setExpiresAt(nextExpiresAt);
      const previous = getAttemptSession(slug);
      setAttemptSession(slug, {
        attemptId: attemptIdRef.current,
        expiresAt: nextExpiresAt,
        accessKind: previous.accessKind ?? null,
      });
    },
    [slug]
  );

  return {
    payload,
    questions,
    answers,
    setAnswers,
    attemptId: attemptIdRef.current,
    expiresAt,
    setExpiresAt: updateSessionExpiry,
    status,
    error,
    refreshSession,
  };
}
