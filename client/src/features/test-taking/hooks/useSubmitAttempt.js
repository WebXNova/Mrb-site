import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { testTakingApi } from '../api/testTakingApi';
import { getSubmitErrorMessage, isAttemptTokenError } from '../utils/apiErrors';
import { clearAttemptSession } from '../utils/attemptSession';

const SUBMIT_TIMEOUT_MS = 45_000;

function submitWithTimeout(slug, attemptId) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      const err = new Error('Submission timed out');
      err.status = 408;
      err.isTimeout = true;
      reject(err);
    }, SUBMIT_TIMEOUT_MS);

    testTakingApi
      .submit(slug, attemptId)
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

export function useSubmitAttempt({ slug, attemptId, refreshSession }) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const inFlightRef = useRef(false);

  const clearSubmitError = useCallback(() => setSubmitError(''), []);

  const executeSubmit = useCallback(async () => {
    if (inFlightRef.current) return { ok: false, reason: 'in_flight' };

    inFlightRef.current = true;
    setIsSubmitting(true);
    setSubmitError('');

    try {
      await submitWithTimeout(slug, attemptId);
      navigate(`/tests/${slug}/result`, { replace: true });
      return { ok: true };
    } catch (err) {
      if (isAttemptTokenError(err)) {
        try {
          const fresh = await refreshSession();
          if (fresh?.attemptId) {
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
  }, [attemptId, navigate, refreshSession, slug]);

  return {
    executeSubmit,
    isSubmitting,
    submitError,
    clearSubmitError,
  };
}
