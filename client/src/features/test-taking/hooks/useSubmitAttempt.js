import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { testTakingApi } from '../api/testTakingApi';
import { getSubmitErrorMessage } from '../utils/apiErrors';
import { setAttemptSession } from '../utils/attemptSession';

export const TIME_UP_SUBMITTED_MESSAGE = 'Time is up — your test was submitted automatically.';

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

export function useSubmitAttempt({ slug, attemptId }) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const inFlightRef = useRef(false);

  const clearSubmitError = useCallback(() => setSubmitError(''), []);

  const executeSubmit = useCallback(
    async ({ timedOut = false } = {}) => {
      if (inFlightRef.current) return { ok: false, reason: 'in_flight' };

      inFlightRef.current = true;
      setIsSubmitting(true);
      setSubmitError('');

      try {
        const response = await submitWithTimeout(slug, attemptId);
        const payload = response?.data ?? response;
        const resultAvailable = payload?.resultAvailable !== false;
        const submittedAttemptId = Number(payload?.attemptId ?? attemptId);

        if (submittedAttemptId) {
          setAttemptSession(slug, { attemptId: submittedAttemptId, expiresAt: null });
        }

        const navState = { attemptId: submittedAttemptId, timedOut: Boolean(timedOut) };
        if (resultAvailable) {
          navigate(`/tests/${slug}/result`, { replace: true, state: navState });
        } else {
          navigate(`/tests/${slug}/submitted`, { replace: true, state: navState });
        }
        return { ok: true };
      } catch (err) {
        setSubmitError(
          timedOut
            ? `Time is up, but submission did not complete. ${getSubmitErrorMessage(err)}`
            : getSubmitErrorMessage(err)
        );
        return { ok: false, reason: 'error' };
      } finally {
        inFlightRef.current = false;
        setIsSubmitting(false);
      }
    },
    [attemptId, navigate, slug]
  );

  return {
    executeSubmit,
    isSubmitting,
    submitError,
    clearSubmitError,
  };
}
