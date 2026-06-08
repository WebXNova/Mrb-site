import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStudentToken } from '../../../auth/session';
import { testInstructionsApi } from '../api/testInstructionsApi';
import { setAttemptSession } from '../utils/attemptSession';

/**
 * Loads public test meta and optional authenticated prep data from the backend.
 */
export function useTestInstructions(slug) {
  const [meta, setMeta] = useState(null);
  const [prep, setPrep] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getStudentToken()));

  const reload = useCallback(async () => {
    const normalizedSlug = String(slug || '').trim();
    if (!normalizedSlug) {
      setStatus('empty');
      setMeta(null);
      setPrep(null);
      setError('Invalid test link.');
      return;
    }

    setStatus('loading');
    setError(null);

    const token = getStudentToken();
    setIsAuthenticated(Boolean(token));

    try {
      const metaResponse = await testInstructionsApi.fetchMeta(normalizedSlug);
      const metaData = metaResponse?.data ?? null;

      if (!metaData?.id) {
        setMeta(null);
        setPrep(null);
        setStatus('empty');
        return;
      }

      setMeta(metaData);

      if (token) {
        try {
          const prepResponse = await testInstructionsApi.fetchPrep(normalizedSlug, token);
          setPrep(prepResponse?.data ?? null);
        } catch (prepErr) {
          setPrep(null);
          if (prepErr?.status === 401 || prepErr?.status === 403) {
            setIsAuthenticated(false);
          }
        }
      } else {
        setPrep(null);
      }

      if (Number(metaData.questionCount) <= 0) {
        setStatus('empty');
        return;
      }

      setStatus('ready');
    } catch (err) {
      setMeta(null);
      setPrep(null);
      setError(err?.message || 'Unable to load test details.');
      setStatus(err?.status === 404 ? 'empty' : 'error');
    }
  }, [slug]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await reload();
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [reload]);

  return {
    meta,
    prep,
    status,
    error,
    isAuthenticated,
    reload,
  };
}

/**
 * Starts or resumes a test attempt; prevents duplicate submissions while in flight.
 */
export function useStartTest(slug) {
  const navigate = useNavigate();
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const inFlightRef = useRef(false);

  const startTest = useCallback(
    async ({ studentName = null } = {}) => {
      const normalizedSlug = String(slug || '').trim();
      if (!normalizedSlug || inFlightRef.current) return;

      const token = getStudentToken();
      if (!token) {
        navigate(`/login?from=${encodeURIComponent(`/tests/${normalizedSlug}`)}`, { replace: true });
        return;
      }

      inFlightRef.current = true;
      setIsStarting(true);
      setStartError('');

      try {
        const response = await testInstructionsApi.startTest(
          normalizedSlug,
          { studentName: studentName?.trim() || null },
          token
        );
        const data = response?.data;

        if (!data?.attemptId || !data?.attemptToken) {
          throw new Error('Could not start the test. Please try again.');
        }

        setAttemptSession(normalizedSlug, {
          attemptId: data.attemptId,
          attemptToken: data.attemptToken,
          expiresAt: data.expiresAt ?? null,
        });

        navigate(`/tests/${normalizedSlug}/start`, { replace: true });
      } catch (err) {
        setStartError(err?.message || 'Unable to start the test.');
      } finally {
        inFlightRef.current = false;
        setIsStarting(false);
      }
    },
    [navigate, slug]
  );

  return { startTest, isStarting, startError, clearStartError: () => setStartError('') };
}
