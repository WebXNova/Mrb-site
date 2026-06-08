import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';

const EMPTY_OPTIONS = {
  categories: [],
  testTypes: [],
  defaultCategory: 'MDCAT',
  defaultTestType: 'subject_wise',
  subjectRules: {},
};

/**
 * Load Step 1 metadata from GET /api/admin/tests/create-options
 * @param {string} token
 */
export function useTestCreateOptions(token) {
  const [options, setOptions] = useState(EMPTY_OPTIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await adminApi.getTestCreateOptions(token);
      const data = response?.data ?? EMPTY_OPTIONS;
      setOptions({
        categories: Array.isArray(data.categories) ? data.categories : [],
        testTypes: Array.isArray(data.testTypes) ? data.testTypes : [],
        defaultCategory: data.defaultCategory ?? 'MDCAT',
        defaultTestType: data.defaultTestType ?? 'subject_wise',
        subjectRules: data.subjectRules ?? {},
      });
      return data;
    } catch (err) {
      setError(err.message || 'Failed to load test form options.');
      setOptions(EMPTY_OPTIONS);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    reload();
  }, [reload]);

  const categoryValues = options.categories.map((c) => c.value);
  const testTypeValues = options.testTypes.map((t) => t.value);

  return { options, categoryValues, testTypeValues, isLoading, error, reload };
}
