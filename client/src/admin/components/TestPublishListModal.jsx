import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { safeAdminErrorMessage } from '../../components/admin/adminSafeMessages';
import { usePublishTest } from '../hooks/usePublishTest';
import TestPublishSummaryCard from './TestPublishSummaryCard';

/**
 * Publish review + confirmation for the tests list — no silent publish, no redirect.
 */
export default function TestPublishListModal({
  testId,
  testTitle,
  open,
  onClose,
  onPublished,
  onBusyChange,
}) {
  const token = getAdminToken();
  const [completeness, setCompleteness] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const { publish, publishing } = usePublishTest(testId, {
    redirectTo: null,
    onSuccess: async (publishedTest) => {
      onClose?.();
      if (onPublished) {
        await onPublished(publishedTest);
      }
    },
  });

  useEffect(() => {
    onBusyChange?.(publishing, testId);
  }, [publishing, testId, onBusyChange]);

  useEffect(() => {
    if (!open || !testId) {
      setCompleteness(null);
      setLoadError('');
      return undefined;
    }

    let cancelled = false;
    setSummaryLoading(true);
    setLoadError('');

    adminApi
      .getTestCompleteness(token, testId)
      .then((response) => {
        if (cancelled) return;
        setCompleteness(response?.data || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setCompleteness(null);
        setLoadError(safeAdminErrorMessage(err, 'Could not load publish summary.'));
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, testId, token]);

  const handleCancel = useCallback(() => {
    if (publishing) return;
    onClose?.();
  }, [onClose, publishing]);

  const handleConfirm = useCallback(async () => {
    await publish();
  }, [publish]);

  if (!open) return null;

  const canPublish = Boolean(completeness?.can_publish);

  return (
    <div className="admin-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="test-publish-list-title">
      <div className="admin-confirm-dialog__panel admin-publish-list-modal">
        <h2 id="test-publish-list-title" className="admin-confirm-dialog__title">
          Publish Test?
        </h2>
        {testTitle ? (
          <p className="admin-stat-card__label" style={{ marginTop: '0.25rem' }}>
            {testTitle}
          </p>
        ) : null}

        {loadError ? (
          <p className="admin-error" style={{ marginTop: '1rem' }}>
            {loadError}
          </p>
        ) : (
          <div style={{ marginTop: '1rem' }}>
            <TestPublishSummaryCard
              publish_summary={completeness?.publish_summary}
              isLoading={summaryLoading}
            />
          </div>
        )}

        <p className="admin-confirm-dialog__body admin-publish-list-modal__warning">
          You will not be able to edit questions after publishing.
        </p>

        {!summaryLoading && completeness && !canPublish ? (
          <p className="admin-test-progress__hint admin-test-progress__hint--warning">
            This test is not ready to publish yet. Complete the missing steps first.
          </p>
        ) : null}

        <div className="admin-confirm-dialog__actions">
          <button type="button" className="btn--course-secondary" onClick={handleCancel} disabled={publishing}>
            Cancel
          </button>
          <button
            type="button"
            className="btn--course-primary"
            onClick={handleConfirm}
            disabled={publishing || summaryLoading || !canPublish}
          >
            {publishing ? 'Please wait…' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}
