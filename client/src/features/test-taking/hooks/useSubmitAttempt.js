import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { testTakingApi } from '../api/testTakingApi';
import { getSubmitErrorMessage, isAttemptTokenError } from '../utils/apiErrors';
import { clearAttemptSession, setAttemptSession } from '../utils/attemptSession';

const SUBMIT_TIMEOUT_MS = 45_000;

function submitWithTimeout(slug, attemptId, token) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      const err = new Error('Submission timed out');
      err.status = 408;
      err.isTimeout = true;
      reject(err);
    }, SUBMIT_TIMEOUT_MS);

    testTakingApi
      .submit(slug, attemptId, token)
      .then((result) => {
        window.clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((err) => {
        window.clearTimeout(timeoutId);
        reject(err);
      });
  });
}

export function useSubmitAttempt({
  slug,
  attemptId,
  attemptToken,
  updateToken,
  refreshSession,
}) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const inFlightRef = useRef(false);
  const tokenRef = useRef(attemptToken);

  tokenRef.current = attemptToken;

  const clearSubmitError = useCallback(() => setSubmitError(''), []);

  const executeSubmit = useCallback(async () => {
    if (inFlightRef.current) return { ok: false, reason: 'in_flight' };

    inFlightRef.current = true;
    setIsSubmitting(true);
    setSubmitError('');

    let token = tokenRef.current;

    try {
      const response = await submitWithTimeout(slug, attemptId, token);

      if (response?.data?.nextAttemptToken) {
        token = response.data.nextAttemptToken;
        tokenRef.current = token;
        updateToken(token);
        setAttemptSession(slug, { attemptId, attemptToken: token });
      }

      navigate(`/tests/${slug}/result`, { replace: true });
      return { ok: true };
    } catch (err) {
      if (isAttemptTokenError(err)) {
        try {
          const fresh = await refreshSession();
          if (fresh?.attemptToken) {
            tokenRef.current = fresh.attemptToken;
            updateToken(fresh.attemptToken);
            inFlightRef.current = false;
            setIsSubmitting(false);
            return executeSubmit();
          }
        } catch {
          clearAttemptSession(slug);
        }
      }

      setSubmitError(getSubmitErrorMessage(err));
      return { ok: false, reason: 'error' };
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  }, [attemptId, navigate, refreshSession, slug, updateToken]);

  return {
    executeSubmit,
    isSubmitting,
    submitError,
    clearSubmitError,
  };
}
