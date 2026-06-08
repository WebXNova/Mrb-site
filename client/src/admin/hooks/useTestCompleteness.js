import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';

const EMPTY_COMPLETENESS = {
  step1_complete: false,
  step2_complete: false,
  step3_complete: false,
  step4_complete: false,
  can_publish: false,
  missing_fields: [],
  lifecycle_status: 'INCOMPLETE',
  question_count: 0,
};

/**
 * @param {string|number|null|undefined} testId
 */
export function useTestCompleteness(testId) {
  const token = getAdminToken();
  const [completeness, setCompleteness] = useState(EMPTY_COMPLETENESS);
  const [isLoading, setIsLoading] = useState(Boolean(testId));
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!testId) {
      setCompleteness(EMPTY_COMPLETENESS);
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    setError('');
    try {
      const response = await adminApi.getTestCompleteness(token, testId);
      const data = response?.data || EMPTY_COMPLETENESS;
      setCompleteness(data);
      return data;
    } catch (err) {
      setError(err.message || 'Failed to load test completeness.');
      setCompleteness(EMPTY_COMPLETENESS);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [token, testId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { completeness, isLoading, error, reload };
}

export function formatMissingFields(missingFields = []) {
  if (!missingFields.length) return '';
  return missingFields.join(', ');
}
