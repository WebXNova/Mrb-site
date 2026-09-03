import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { testTakingApi } from '../api/testTakingApi';
import { getSubmitErrorMessage } from '../utils/apiErrors';
import { clearAnswerDraft } from '../utils/answerDraft';
import { setAttemptSession } from '../utils/attemptSession';
import { logExamDebug, logExamError } from '../utils/examDebug';
import { withTimeout } from '../utils/withTimeout';
import { freeSessionPostSubmitPath } from '../../free-session/freeSessionNav';

export const TIME_UP_SUBMITTED_MESSAGE = 'Time is up. Your test was submitted automatically.';

export const SUBMIT_STATUS = {
  IDLE: 'idle',
  SUBMITTING: 'submitting',
  SUCCESS: 'success',
  ERROR: 'error',
};

const SUBMIT_TIMEOUT_MS = 45_000;

function submitWithTimeout(slug, attemptId) {
  return withTimeout(
    testTakingApi.submit(slug, attemptId),
    SUBMIT_TIMEOUT_MS,
    'Submission timed out'
  );
}

function hasValidAttemptId(attemptId) {
  if (attemptId == null || attemptId === '') return false;
  const numeric = Number(attemptId);
  return Number.isFinite(numeric) && numeric > 0;
}

export function useSubmitAttempt({ slug, attemptId }) {
  const navigate = useNavigate();
  const [submitStatus, setSubmitStatus] = useState(SUBMIT_STATUS.IDLE);
  const [submitError, setSubmitError] = useState('');
  const inFlightRef = useRef(false);
  const inFlightPromiseRef = useRef(null);
  const completedRef = useRef(false);

  const isSubmitting = submitStatus === SUBMIT_STATUS.SUBMITTING;
  const isSubmitSuccess = submitStatus === SUBMIT_STATUS.SUCCESS;

  const clearSubmitError = useCallback(() => {
    if (completedRef.current) return;
    setSubmitError('');
    setSubmitStatus((prev) => (prev === SUBMIT_STATUS.ERROR ? SUBMIT_STATUS.IDLE : prev));
  }, []);

  const executeSubmit = useCallback(
    async ({ timedOut = false, prepare } = {}) => {
      if (completedRef.current) {
        return { ok: true, already: true };
      }

      if (inFlightPromiseRef.current) {
        return inFlightPromiseRef.current;
      }

      if (!slug || !hasValidAttemptId(attemptId)) {
        const message = 'Missing test session. Return to the test page and try again.';
        setSubmitStatus(SUBMIT_STATUS.ERROR);
        setSubmitError(message);
        logExamError('submit-missing-session', new Error(message), { slug, attemptId });
        return { ok: false, reason: 'missing_session' };
      }

      const work = (async () => {
        inFlightRef.current = true;
        setSubmitStatus(SUBMIT_STATUS.SUBMITTING);
        setSubmitError('');
        logExamDebug('submit-start', { slug, attemptId, timedOut });

        try {
          if (typeof prepare === 'function') {
            try {
              await prepare();
            } catch (prepErr) {
              logExamError('submit-flush-failed', prepErr, { slug, attemptId });
            }
          }

          const response = await submitWithTimeout(slug, attemptId);
          if (response && response.success === false) {
            const err = new Error(response.message || 'Your test could not be submitted. Please try again.');
            err.status = 400;
            throw err;
          }

          const payload = response?.data ?? response;
          const submittedAttemptId = Number(payload?.attemptId ?? attemptId);

          completedRef.current = true;
          setSubmitStatus(SUBMIT_STATUS.SUCCESS);
          clearAnswerDraft(slug, attemptId);

          if (submittedAttemptId) {
            setAttemptSession(slug, { attemptId: submittedAttemptId, expiresAt: null });
          }

          logExamDebug('submit-success', {
            slug,
            attemptId: submittedAttemptId,
            nextStep: payload?.nextStep ?? null,
            timedOut,
          });

          const navState = { attemptId: submittedAttemptId, timedOut: Boolean(timedOut) };
          navigate(freeSessionPostSubmitPath(slug, payload), { replace: true, state: navState });
          return { ok: true };
        } catch (err) {
          logExamError('submit-failed', err, { slug, attemptId, timedOut });
          setSubmitStatus(SUBMIT_STATUS.ERROR);
          setSubmitError(
            timedOut
              ? `Time is up, but submission did not complete. ${getSubmitErrorMessage(err)}`
              : getSubmitErrorMessage(err)
          );
          return { ok: false, reason: 'error' };
        } finally {
          inFlightRef.current = false;
          inFlightPromiseRef.current = null;
        }
      })();

      inFlightPromiseRef.current = work;
      return work;
    },
    [attemptId, navigate, slug]
  );

  return {
    executeSubmit,
    isSubmitting,
    isSubmitSuccess,
    submitStatus,
    submitError,
    clearSubmitError,
  };
}
