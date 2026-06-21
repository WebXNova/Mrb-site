import { useCallback, useState } from 'react';
import { usePublishTest } from '../hooks/usePublishTest';
import TestPublishCallout from './TestPublishCallout';
import TestPublishConfirmDialog from './TestPublishConfirmDialog';
import TestPublishSummaryCard from './TestPublishSummaryCard';

/**
 * Summary card + publish CTA + confirmation modal.
 * Publish only runs after explicit confirmation — no silent publish.
 */
export default function TestPublishActions({
  testId,
  completeness,
  summaryLoading = false,
  onPublished,
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const { publish, publishing } = usePublishTest(testId, {
    onSuccess: async (publishedTest) => {
      setModalOpen(false);
      if (onPublished) {
        await onPublished(publishedTest);
      }
    },
    redirectTo: null,
  });

  const handleOpenModal = useCallback(() => {
    if (publishing) return;
    setModalOpen(true);
  }, [publishing]);

  const handleConfirmPublish = useCallback(async () => {
    await publish();
  }, [publish]);

  const handleCancel = useCallback(() => {
    if (publishing) return;
    setModalOpen(false);
  }, [publishing]);

  return (
    <>
      <TestPublishSummaryCard publish_summary={completeness?.publish_summary} isLoading={summaryLoading} />
      <TestPublishCallout onPublish={handleOpenModal} publishing={publishing} />
      <TestPublishConfirmDialog
        open={modalOpen}
        publishing={publishing}
        onConfirm={handleConfirmPublish}
        onCancel={handleCancel}
      />
    </>
  );
}
