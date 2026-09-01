import { useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { isTestPublishedStatus } from '../utils/testBasicInfoValidation';

/**
 * Loads admin test status. Published tests stay editable by authorized admins.
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
        setTestStatus(status);
        setReadOnly(false);
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

  return {
    readOnly,
    testStatus,
    isPublished: isTestPublishedStatus(testStatus),
    loading,
    error,
  };
}
