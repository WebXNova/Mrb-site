import { useEffect, useState } from 'react';
import { studentApi } from '../../api/studentApi';

function getBrowserDeviceLabel() {
  if (typeof navigator === 'undefined') return 'Web browser';
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Microsoft Edge';
  if (/Firefox\//.test(ua)) return 'Mozilla Firefox';
  if (/Chrome\//.test(ua)) return 'Google Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Web browser';
}

function normalizeSession(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    status: row.status || 'unknown',
    isCurrent: Boolean(row.isCurrent),
    createdAt: row.createdAt ?? null,
    lastUsedAt: row.lastUsedAt ?? null,
    expiresAt: row.expiresAt ?? null,
    revokedAt: row.revokedAt ?? null,
    device: row.isCurrent ? getBrowserDeviceLabel() : 'Signed-in device',
  };
}

export function useStudentSessions() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const response = await studentApi.sessions();
        if (cancelled) return;
        const rows = Array.isArray(response?.data?.sessions) ? response.data.sessions : [];
        setSessions(rows.map(normalizeSession).filter(Boolean));
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || 'Failed to load your sessions.');
        setSessions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeSessions = sessions.filter((session) => session.status === 'active');

  return { sessions, activeSessions, loading, error };
}
