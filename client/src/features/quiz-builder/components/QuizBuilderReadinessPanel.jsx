import { adminRoute } from '../../../config/adminPaths';
import { Link } from 'react-router-dom';
import TestWizardMissingHint from '../../../admin/components/TestWizardMissingHint.jsx';
import { isTestPublishedStatus } from '../../../admin/utils/testBasicInfoValidation.js';

/**
 * On-page readiness checklist for the Questions step.
 */
export default function QuizBuilderReadinessPanel({
  completeness,
  testId,
  draftStatus,
  saveError = '',
  onSaveNow,
  isSaving = false,
  readOnly = false,
}) {
  if (!completeness || readOnly || isTestPublishedStatus(completeness.lifecycle_status)) {
    return null;
  }

  const missing = completeness.missing_fields || [];
  const needsSync = missing.includes('quiz_draft');
  const showSaveNow =
    Boolean(onSaveNow) &&
    (needsSync || draftStatus === 'unsaved' || draftStatus === 'error' || draftStatus === 'offline');

  if (!missing.length && completeness.can_publish) {
    return (
      <div className="admin-test-readiness admin-test-readiness--ready" role="status">
        <p className="admin-test-readiness__title">Ready to publish</p>
        <p className="admin-test-readiness__text">
          Questions are saved.{' '}
          <Link to={adminRoute(`tests/${testId}/details`)}>Continue to Publish →</Link>
        </p>
      </div>
    );
  }

  if (!missing.length) return null;

  return (
    <section className="admin-test-readiness" aria-label="Before you can publish">
      <p className="admin-test-readiness__title">Before you can publish</p>
      <TestWizardMissingHint
        missingFields={missing}
        activeStep="questions"
        testId={testId}
        variant="list"
      />
      {needsSync ? (
        <p className="admin-test-readiness__sync-hint">
          {draftStatus === 'saved'
            ? 'Syncing… refresh in a moment or click Save now.'
            : draftStatus === 'saving'
              ? 'Saving to server…'
              : draftStatus === 'error'
                ? saveError || 'Fix the errors above, then save again.'
                : 'Edits auto-save — or click Save now to sync immediately.'}
        </p>
      ) : null}
      {showSaveNow ? (
        <div className="admin-test-readiness__actions">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={onSaveNow}
            disabled={isSaving || draftStatus === 'saving'}
            aria-busy={isSaving || draftStatus === 'saving' || undefined}
          >
            {isSaving || draftStatus === 'saving' ? 'Saving…' : 'Save now'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
