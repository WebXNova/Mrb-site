import { useEffect, useState } from 'react';
import { getApiBaseUrl } from '../../api/runtimeConfig';

export async function fetchPostedRemarks() {
  const response = await fetch(`${getApiBaseUrl()}/contact/remarks/posted`, {
    credentials: 'omit',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    throw new Error(body?.error?.message || 'Failed to load remarks');
  }
  return body?.data || [];
}

export function usePostedRemarks() {
  const [remarks, setRemarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPostedRemarks()
      .then((items) => {
        if (!cancelled) {
          setRemarks(items);
          setError('');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRemarks([]);
          setError(err.message || 'Failed to load');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { remarks, loading, error, refetch: fetchPostedRemarks };
}
