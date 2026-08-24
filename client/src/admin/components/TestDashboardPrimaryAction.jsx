import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminRoute } from '../../config/adminPaths';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { useAdminToast } from '../context/AdminToastContext';
import { usePublishTest } from '../hooks/usePublishTest';
import { isTestPublishedStatus } from '../utils/testBasicInfoValidation';
import TestPublishConfirmDialog from './TestPublishConfirmDialog';
import { getMissingItemsFromCompleteness } from './TestWizardMissingHint';

function resolveBlockMessage(report) {
  const items = getMissingItemsFromCompleteness(report, {});
  if (items.length) {
    return items.map((item) => item.text).join(' · ');
  }
  if (report?.publish_block_message) return report.publish_block_message;
  const failures =
    report?.mcq_validation_failures ?? report?.validation?.publish?.mcq_validation_failures;
  const first = failures?.[0]?.issues?.[0]?.message;
  if (first) return first;
  const missing = Array.isArray(report?.missing_fields) ? report.missing_fields : [];
  if (missing.length) {
    return `Cannot publish — still needed: ${missing.join(', ')}.`;
  }
  return 'This test is not ready to publish yet. Open Publish for details.';
}

/**
 * Dashboard header primary action — publish draft tests or open publish page for live tests.
 */
export default function TestDashboardPrimaryAction({ testId, testStatus, onPublished }) {
  const token = getAdminToken();
  const navigate = useNavigate();
  const toast = useAdminToast();
  const published = isTestPublishedStatus(testStatus);
  const [modalOpen, setModalOpen] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const [blockMessage, setBlockMessage] = useState('');
  const [completenessLoaded, setCompletenessLoaded] = useState(false);

  const { publish, publishing } = usePublishTest(testId, {
    onSuccess: async () => {
      setModalOpen(false);
      if (onPublished) await onPublished();
    },
    redirectTo: null,
  });

  useEffect(() => {
    if (!testId || published) {
      setCanPublish(false);
      setBlockMessage('');
      setCompletenessLoaded(true);
      return undefined;
    }

    setCompletenessLoaded(false);
    let cancelled = false;
    adminApi
      .getTestCompleteness(token, testId)
      .then((response) => {
        if (cancelled) return;
        const report = response?.data;
        setCanPublish(Boolean(report?.can_publish));
        setBlockMessage(report?.can_publish ? '' : resolveBlockMessage(report));
        setCompletenessLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setCanPublish(false);
          setBlockMessage('Could not verify publish readiness.');
          setCompletenessLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [published, testId, token]);

  const handlePublishClick = useCallback(() => {
    if (publishing || !completenessLoaded) return;
    if (!canPublish) {
      toast.error(blockMessage || 'This test is not ready to publish yet.');
      navigate(adminRoute(`tests/${testId}/publish`));
      return;
    }
    setModalOpen(true);
  }, [blockMessage, canPublish, completenessLoaded, navigate, publishing, testId, toast]);

  if (published) {
    return (
      <Link className="btn btn--primary" to={adminRoute(`tests/${testId}/publish`)}>
        Update
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        className="btn btn--primary"
        onClick={handlePublishClick}
        disabled={publishing || !completenessLoaded}
        aria-busy={publishing || undefined}
      >
        {publishing ? 'Publishing…' : 'Publish'}
      </button>
      <TestPublishConfirmDialog
        open={modalOpen}
        publishing={publishing}
        onConfirm={publish}
        onCancel={() => {
          if (!publishing) setModalOpen(false);
        }}
      />
    </>
  );
}
