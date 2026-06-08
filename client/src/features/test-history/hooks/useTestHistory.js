import { useCallback, useEffect, useState } from 'react';
import { testHistoryApi } from '../api/testHistoryApi';
import { getHistoryErrorMessage, normalizeHistoryPayload } from '../utils/normalizeHistory';

export function useTestHistory({ page, pageSize, search, status }) {
  const [data, setData] = useState(null);
  const [statusState, setStatusState] = useState('loading');
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setStatusState('loading');
    setError('');

    try {
      const response = await testHistoryApi.fetchHistory({ page, pageSize, search, status });
      const normalized = normalizeHistoryPayload(response);

      if (!normalized) {
        setData(null);
        setStatusState('error');
        setError('Invalid response from server.');
        return;
      }

      setData(normalized);
      setStatusState('ready');
    } catch (err) {
      setData(null);
      setError(getHistoryErrorMessage(err));
      setStatusState('error');
    }
  }, [page, pageSize, search, status]);

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

  return { data, status: statusState, error, reload };
}
