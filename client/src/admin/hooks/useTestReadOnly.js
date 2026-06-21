import { useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { isTestPublishedStatus } from '../utils/testBasicInfoValidation';

/**
 * Resolves whether a test is published (read-only) from server truth.
 *
 * @param {string|number|null|undefined} testId
 */
export function useTestReadOnly(testId) {
  const [readOnly, setReadOnly] = useState(false);
  const [testStatus, setTestStatus] = useState('');
  const [loading, setLoading] = useState(Boolean(testId));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!testId) {
      setReadOnly(false);
      setTestStatus('');
      setLoading(false);
      setError('');
      return undefined;
    }

    let cancelled = false;
    const token = getAdminToken();
    setLoading(true);
    setError('');

    adminApi
      .getTest(token, testId)
      .then((response) => {
        if (cancelled) return;
        const test = response?.data;
        const status = test?.status ?? '';
        const locked =
          Boolean(test?.isReadOnly) ||
          Boolean(test?.isLocked) ||
          isTestPublishedStatus(status);
        setTestStatus(status);
        setReadOnly(locked);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load test lock status.');
          setReadOnly(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [testId]);

  return { readOnly, testStatus, loading, error };
}
