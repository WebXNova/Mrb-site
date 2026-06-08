import { useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';

/**
 * Load test title for page headers (title only in h1).
 */
export function useTestTitle(testId) {
  const token = getAdminToken();
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!testId) return;
    let cancelled = false;

    adminApi
      .getTest(token, testId)
      .then((response) => {
        if (!cancelled) setTitle(String(response?.data?.title ?? '').trim());
      })
      .catch(() => {
        if (!cancelled) setTitle('');
      });

    return () => {
      cancelled = true;
    };
  }, [token, testId]);

  return title;
}

export function testPageHeading(testTitle, testId) {
  return testTitle || `Test #${testId}`;
}
