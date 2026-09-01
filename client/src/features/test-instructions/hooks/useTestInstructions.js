import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getStudentToken } from '../../../auth/session';
import { testsApi } from '../../../api/adminApi';
import { markStandaloneSession, standaloneTestsApi } from '../../../api/standaloneTestsApi';
import { setAttemptSession } from '../utils/attemptSession';
import { getTestAccessErrorMessage } from '../utils/testAccessErrors';

function isStandaloneKind(kind) {
  return kind === 'free_standalone' || kind === 'paid_standalone';
}

async function fetchPublicMeta(slug, accessHint) {
  const preferStandalone = accessHint === 'free' || accessHint === 'paid' || accessHint === 'standalone';
  if (preferStandalone) {
    const response = await standaloneTestsApi.publicDetail(slug);
    return { response, source: 'standalone' };
  }
  try {
    const response = await testsApi.getPublicTestMeta(slug);
    return { response, source: 'course' };
  } catch (err) {
    if (Number(err?.status) === 404) {
      const response = await standaloneTestsApi.publicDetail(slug);
      return { response, source: 'standalone' };
    }
    throw err;
  }
}

/**
 * Loads public test meta and optional authenticated prep data from the backend.
 */
export function useTestInstructions(slug) {
  const [searchParams] = useSearchParams();
  const accessHint = String(searchParams.get('access') || '').trim().toLowerCase();
  const [meta, setMeta] = useState(null);
  const [prep, setPrep] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getStudentToken()));
  const [accessKind, setAccessKind] = useState(null);

  const reload = useCallback(async (options = {}) => {
    const quiet = options.quiet === true;
    const normalizedSlug = String(slug || '').trim();
    if (!normalizedSlug) {
      setStatus('empty');
      setMeta(null);
      setPrep(null);
      setError('Invalid test link.');
      return;
    }

    if (!quiet) {
      setStatus('loading');
      setError(null);
    }

    const token = getStudentToken();
    setIsAuthenticated(Boolean(token));

    try {
      const { response, source } = await fetchPublicMeta(normalizedSlug, accessHint);
      const metaData = response?.data ?? null;

      if (!metaData?.id && !metaData?.slug && !metaData?.title) {
        setMeta(null);
        setPrep(null);
        setStatus('empty');
        return;
      }

      const kind =
        metaData.accessKind ||
        (source === 'course'
          ? 'course_locked'
          : Number(metaData.pricePkr ?? metaData.price_pkr ?? 0) > 0
            ? 'paid_standalone'
            : 'free_standalone');
      setAccessKind(kind);
      if (isStandaloneKind(kind)) {
        markStandaloneSession(normalizedSlug, kind);
      }

      const normalizedMeta = {
        id: metaData.id ?? metaData.testId ?? null,
        title: metaData.title,
        subject: metaData.subject,
        questionCount: metaData.questionCount ?? metaData.question_count ?? 0,
        durationMinutes: metaData.durationMinutes ?? metaData.duration_minutes ?? 0,
        description: metaData.description,
        showResultImmediately: metaData.showResultImmediately ?? metaData.show_result_immediately,
        showAnswersAfterSubmit: metaData.showAnswersAfterSubmit ?? metaData.show_answers_after_submit,
        showExplanations: metaData.showExplanations ?? metaData.show_explanations,
        accessKind: kind,
        examOpen: metaData.examOpen,
        startDate: metaData.startDate ?? metaData.start_date,
        endDate: metaData.endDate ?? metaData.end_date,
        ...metaData,
      };
      setMeta(normalizedMeta);

      if (token) {
        try {
          const prepResponse = isStandaloneKind(kind)
            ? await standaloneTestsApi.prep(normalizedSlug)
            : await testsApi.getTestPrep(normalizedSlug);
          setPrep(prepResponse?.data ?? null);
        } catch (prepErr) {
          setPrep(null);
          if (prepErr?.status === 401) {
            setIsAuthenticated(false);
          }
        }
      } else {
        setPrep(null);
      }

      if (Number(normalizedMeta.questionCount) <= 0) {
        setStatus('empty');
        return;
      }

      setStatus('ready');
    } catch (err) {
      setMeta(null);
      setPrep(null);
      setError(getTestAccessErrorMessage(err, 'Unable to load test details.'));
      setStatus(err?.status === 404 ? 'empty' : 'error');
    }
  }, [accessHint, slug]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await reload();
      if (cancelled) return;
    })();

    function onForeground() {
      if (document.visibilityState === 'visible') {
        reload({ quiet: true });
      }
    }

    document.addEventListener('visibilitychange', onForeground);
    window.addEventListener('focus', onForeground);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onForeground);
      window.removeEventListener('focus', onForeground);
    };
  }, [reload]);

  return {
    meta,
    prep,
    status,
    error,
    isAuthenticated,
    accessKind,
    reload,
  };
}

/**
 * Starts or resumes a test attempt; prevents duplicate submissions while in flight.
 */
export function useStartTest(slug, accessKind) {
  const navigate = useNavigate();
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const inFlightRef = useRef(false);

  const startTest = useCallback(
    async ({ studentName = null } = {}) => {
      const normalizedSlug = String(slug || '').trim();
      if (!normalizedSlug || inFlightRef.current) return;

      const standalone = isStandaloneKind(accessKind);
      const token = getStudentToken();
      if (!token) {
        const accessQuery =
          accessKind === 'free_standalone'
            ? '?access=free'
            : accessKind === 'paid_standalone'
              ? '?access=paid'
              : '';
        navigate(`/login?from=${encodeURIComponent(`/tests/${normalizedSlug}${accessQuery}`)}`, {
          replace: true,
        });
        return;
      }

      inFlightRef.current = true;
      setIsStarting(true);
      setStartError('');

      try {
        if (standalone) {
          markStandaloneSession(normalizedSlug, accessKind);
        }
        const response = standalone
          ? await standaloneTestsApi.verifyCode(normalizedSlug, {
              studentName: studentName?.trim() || null,
            })
          : await testsApi.verifyCode(normalizedSlug, {
              studentName: studentName?.trim() || null,
            });
        const data = response?.data;

        if (!data?.attemptId) {
          throw new Error('Could not start the test. Please try again.');
        }

        setAttemptSession(normalizedSlug, {
          attemptId: data.attemptId,
          expiresAt: data.expiresAt ?? null,
          accessKind: standalone ? accessKind : null,
        });

        navigate(`/tests/${normalizedSlug}/start`, { replace: true });
      } catch (err) {
        setStartError(getTestAccessErrorMessage(err, 'Unable to start the test.'));
      } finally {
        inFlightRef.current = false;
        setIsStarting(false);
      }
    },
    [accessKind, navigate, slug]
  );

  return { startTest, isStarting, startError, clearStartError: () => setStartError('') };
}
