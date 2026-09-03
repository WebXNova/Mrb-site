import { useEffect } from 'react';
import Button from '../ui/Button';
import { useFocusTrap } from '../../features/test-taking/hooks/useFocusTrap';
import './CourseEnrollmentCtaButton.css';

/**
 * Paid → paid (or free → paid) confirmation. Wording matches backend:
 * activating the new course deactivates the current one.
 */
export default function EnrollmentSwitchModal({
  open,
  mode = 'change',
  currentCourseName,
  targetCourseName,
  confirming = false,
  onConfirm,
  onCancel,
}) {
  const isUpgrade = mode === 'upgrade';
  const title = isUpgrade ? 'Upgrade Course?' : 'Change Course?';
  const confirmLabel = confirming ? 'Processing…' : isUpgrade ? 'Upgrade Course' : 'Change Course';
  const panelRef = useFocusTrap(open, { onEscape: onCancel });

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="enrollment-switch-modal" role="presentation">
      <div className="enrollment-switch-modal__backdrop" onClick={confirming ? undefined : onCancel} aria-hidden="true" />
      <div
        ref={panelRef}
        className="enrollment-switch-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="switch-modal-title"
        aria-describedby="switch-modal-desc"
        tabIndex={-1}
      >
        <h2 id="switch-modal-title" className="heading-3">
          {title}
        </h2>
        <div id="switch-modal-desc" className="enrollment-switch-modal__body">
          <p>
            You are currently enrolled in:
            <strong>{currentCourseName || 'your current course'}</strong>
          </p>
          <p>
            You are about to move to:
            <strong>{targetCourseName || 'this course'}</strong>
          </p>
          <p className="enrollment-switch-modal__warning">
            <strong>Important:</strong> Changing your course removes access to your current course
            according to the platform enrollment rules. Your current course will no longer be
            available after this change completes.
          </p>
          <p>Are you sure you want to continue?</p>
        </div>
        <div className="enrollment-switch-modal__actions">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={confirming}>
            Cancel
          </Button>
          <Button type="button" variant="accent" onClick={onConfirm} disabled={confirming} aria-busy={confirming}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
