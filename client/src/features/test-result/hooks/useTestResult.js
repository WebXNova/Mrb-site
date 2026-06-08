import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStudentToken } from '../../../auth/session';
import { testResultApi } from '../api/testResultApi';
import { getResultErrorState, normalizeResultPayload } from '../utils/normalizeResult';

export function useTestResult({ slug, attemptId }) {
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('loading');
  const [errorState, setErrorState] = useState(null);

  const reload = useCallback(async () => {
    const aid = Number(attemptId);
    if (!aid) {
      setStatus('error');
      setErrorState({ kind: 'not_found', message: 'Missing attempt reference.' });
      return;
    }

    const token = getStudentToken();
    if (!token) {
      const from = slug
        ? `/tests/${slug}/result`
        : `/dashboard/tests/history`;
      navigate(`/login?from=${encodeURIComponent(from)}`, { replace: true });
      return;
    }

    setStatus('loading');
    setErrorState(null);

    try {
      const response = await testResultApi.fetchResult(aid);
      const normalized = normalizeResultPayload(response);

      if (!normalized) {
        setResult(null);
        setStatus('error');
        setErrorState({ kind: 'error', message: 'Invalid result response from server.' });
        return;
      }

      setResult(normalized);
      setStatus('ready');
    } catch (err) {
      setResult(null);
      setErrorState(getResultErrorState(err));
      setStatus('error');
    }
  }, [attemptId, navigate, slug]);

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

  return { result, status, errorState, reload };
}
