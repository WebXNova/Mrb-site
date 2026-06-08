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

/**
 * Loads attempt start payload from the backend.
 */
export function useTestAttemptLoad(slug) {
  const navigate = useNavigate();
  const session = getAttemptSession(slug);

  const [payload, setPayload] = useState(null);
  const [answers, setAnswers] = useState({});
  const [attemptToken, setAttemptToken] = useState(session.attemptToken || '');
  const [expiresAt, setExpiresAt] = useState(session.expiresAt ?? null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  const attemptIdRef = useRef(session.attemptId);
  const tokenRef = useRef(session.attemptToken || '');

  const applyPayload = useCallback(
    (response, activeSession) => {
      const data = response?.data;
      const nextToken = data?.nextAttemptToken || activeSession.attemptToken;
      const attemptExpiresAt = data?.attempt?.expiresAt ?? null;

      tokenRef.current = nextToken;
      attemptIdRef.current = activeSession.attemptId;

      setAttemptSession(slug, {
        attemptId: activeSession.attemptId,
        attemptToken: nextToken,
        expiresAt: attemptExpiresAt,
      });

      setAttemptToken(nextToken);
      setExpiresAt(attemptExpiresAt);
      setPayload(data);
      setAnswers(normalizeSavedAnswers(data?.savedAnswers));
      setStatus('ready');
      setError('');
    },
    [slug]
  );

  const refreshSession = useCallback(async () => {
    const studentToken = getStudentToken();
    if (!studentToken) return null;

    const response = await testTakingApi.resumeAttempt(slug, studentToken);
    const data = response?.data;
    if (!data?.attemptId || !data?.attemptToken) return null;

    const fresh = {
      attemptId: data.attemptId,
      attemptToken: data.attemptToken,
      expiresAt: data.expiresAt ?? null,
    };
    setAttemptSession(slug, fresh);
    return fresh;
  }, [slug]);

  useEffect(() => {
    if (!session.attemptId || !session.attemptToken) {
      navigate(`/tests/${slug}`, { replace: true });
      return undefined;
    }

    let cancelled = false;

    async function load() {
      setStatus('loading');
      setError('');

      let activeSession = {
        attemptId: session.attemptId,
        attemptToken: session.attemptToken,
      };

      try {
        const response = await testTakingApi.loadStart(
          slug,
          activeSession.attemptId,
          activeSession.attemptToken
        );
        if (cancelled) return;
        applyPayload(response, activeSession);
      } catch (err) {
        if (cancelled) return;

        if (isAttemptTokenError(err)) {
          try {
            const fresh = await refreshSession();
            if (fresh && !cancelled) {
              activeSession = fresh;
              const response = await testTakingApi.loadStart(
                slug,
                fresh.attemptId,
                fresh.attemptToken
              );
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
  }, [applyPayload, navigate, refreshSession, session.attemptId, session.attemptToken, slug]);

  const questions = normalizeAttemptQuestions(payload?.test?.questions);

  const updateToken = useCallback(
    (nextToken, nextExpiresAt) => {
      if (!nextToken) return;
      tokenRef.current = nextToken;
      setAttemptToken(nextToken);
      setAttemptSession(slug, {
        attemptId: attemptIdRef.current,
        attemptToken: nextToken,
        expiresAt: nextExpiresAt ?? expiresAt,
      });
      if (nextExpiresAt) setExpiresAt(nextExpiresAt);
    },
    [expiresAt, slug]
  );

  return {
    payload,
    questions,
    answers,
    setAnswers,
    attemptId: attemptIdRef.current,
    attemptToken,
    tokenRef,
    expiresAt,
    setExpiresAt,
    status,
    error,
    updateToken,
    refreshSession,
  };
}
