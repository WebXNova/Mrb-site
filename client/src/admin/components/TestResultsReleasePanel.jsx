import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import AdminConfirmDialog from './AdminConfirmDialog';

function formatReleasedAt(iso) {
  if (!iso) return 'Not Released';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Not Released';
  return `Released on ${date.toLocaleString()}`;
}

/**
 * Manual result release control — shared by Publish and Results pages.
 */
export default function TestResultsReleasePanel({
  testId,
  resultsReleasedAt = null,
  disabled = false,
  onChanged,
}) {
  const token = getAdminToken();
  const [releasedAt, setReleasedAt] = useState(resultsReleasedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  const isReleased = Boolean(releasedAt);

  useEffect(() => {
    setReleasedAt(resultsReleasedAt);
  }, [resultsReleasedAt]);

  const handleRelease = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const response = await adminApi.releaseTestResults(token, testId);
      const next = response?.data?.results_released_at ?? new Date().toISOString();
      setReleasedAt(next);
      setConfirmAction(null);
      onChanged?.(next);
    } catch (err) {
      setError(err.message || 'Failed to release results.');
    } finally {
      setBusy(false);
    }
  }, [onChanged, testId, token]);

  const handleUnrelease = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      await adminApi.unreleaseTestResults(token, testId);
      setReleasedAt(null);
      setConfirmAction(null);
      onChanged?.(null);
    } catch (err) {
      setError(err.message || 'Failed to unrelease results.');
    } finally {
      setBusy(false);
    }
  }, [onChanged, testId, token]);

  if (!testId) return null;

  return (
    <section className="admin-test-release-panel" aria-labelledby="admin-test-release-heading">
      <div className="admin-test-release-panel__header">
        <div>
          <h3 id="admin-test-release-heading" className="heading-5" style={{ margin: 0 }}>
            Results Released
          </h3>
          <p className="admin-field__hint" style={{ margin: 'var(--space-1) 0 0' }}>
            {formatReleasedAt(releasedAt ?? resultsReleasedAt)}
          </p>
        </div>
        {!disabled ? (
          isReleased ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setConfirmAction('unrelease')}
              disabled={busy}
            >
              Unrelease Results
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => setConfirmAction('release')}
              disabled={busy}
            >
              Release Results
            </button>
          )
        ) : null}
      </div>

      {error ? <p className="admin-error">{error}</p> : null}

      <AdminConfirmDialog
        open={confirmAction === 'release'}
        title="Release results to students?"
        message="All submitted attempts for this test will become visible to students. You can hide them again with Unrelease if needed."
        confirmLabel="Release Results"
        cancelLabel="Cancel"
        busy={busy}
        onConfirm={handleRelease}
        onCancel={() => setConfirmAction(null)}
      />

      <AdminConfirmDialog
        open={confirmAction === 'unrelease'}
        title="Hide results from students?"
        message="Students will no longer see scores, answer review, or explanations until you release results again."
        confirmLabel="Unrelease Results"
        cancelLabel="Cancel"
        danger
        busy={busy}
        onConfirm={handleUnrelease}
        onCancel={() => setConfirmAction(null)}
      />
    </section>
  );
}
