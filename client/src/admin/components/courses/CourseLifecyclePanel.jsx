import { useState } from 'react';
import { adminApi } from '../../../api/adminApi';
import { useAdminToast } from '../../context/AdminToastContext';
import AdminConfirmDialog from '../AdminConfirmDialog';
import AdminLoadingButton from '../AdminLoadingButton';
import CourseFinishedBadge from './CourseFinishedBadge';

export default function CourseLifecyclePanel({
  token,
  courseId,
  isFinished = false,
  disabled = false,
  onFinished,
}) {
  const toast = useAdminToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loadingCount, setLoadingCount] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [affectedCount, setAffectedCount] = useState(null);
  const [loadError, setLoadError] = useState('');

  async function openConfirm() {
    setDialogOpen(true);
    setLoadingCount(true);
    setLoadError('');
    setAffectedCount(null);
    try {
      const res = await adminApi.courseFinishPreview(token, courseId);
      const payload = res?.data ?? res ?? {};
      const count = Number(payload.active_enrollment_count ?? payload.activeEnrollmentCount ?? 0);
      setAffectedCount(Number.isFinite(count) ? count : 0);
    } catch (err) {
      setLoadError(err?.message || 'Could not load the number of students who would lose access.');
    } finally {
      setLoadingCount(false);
    }
  }

  function closeConfirm() {
    if (submitting) return;
    setDialogOpen(false);
    setLoadError('');
  }

  async function confirmFinish() {
    if (loadError || loadingCount) return;
    setSubmitting(true);
    try {
      const res = await adminApi.markCourseFinished(token, courseId, { confirm: true });
      const payload = res?.data ?? {};
      toast.success('Course marked finished. Enrolled students no longer have access.');
      setDialogOpen(false);
      onFinished?.(payload);
    } catch (err) {
      toast.error(err?.message || 'Could not mark this course finished.');
    } finally {
      setSubmitting(false);
    }
  }

  const countReady = !loadingCount && affectedCount != null && !loadError;
  const studentPhrase =
    affectedCount === 1
      ? '1 student currently has active access and will lose it.'
      : `${affectedCount ?? 0} students currently have active access and will lose it.`;

  if (isFinished) {
    return (
      <div className="course-edit-card course-edit-card--lifecycle course-edit-card--lifecycle-done" role="status">
        <div className="course-lifecycle-panel__head">
          <h3 className="course-edit-form__group-title">End this course</h3>
          <CourseFinishedBadge />
        </div>
        <p className="course-lifecycle-panel__text">
          This course is finished. Enrolled students no longer have access, and new enrollments are
          blocked. Catalog visibility (Active / Inactive) is still a separate setting.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="course-edit-card course-edit-card--lifecycle">
        <div className="course-lifecycle-panel__head">
          <h3 className="course-edit-form__group-title">End this course</h3>
        </div>
        <p className="course-lifecycle-panel__text">
          Marks the course finished: every student with active access loses it, and new enrollments
          are blocked. Active / Inactive is not changed. This cannot be undone from this screen.
        </p>
        <div className="course-lifecycle-panel__actions">
          <AdminLoadingButton
            type="button"
            className="btn--course-danger"
            disabled={disabled}
            onClick={openConfirm}
          >
            Mark course finished
          </AdminLoadingButton>
        </div>
      </div>

      <AdminConfirmDialog
        open={dialogOpen}
        danger
        busy={submitting || loadingCount}
        confirmDisabled={!countReady}
        title="Mark this course finished?"
        confirmLabel={countReady ? 'Mark finished' : 'Confirm'}
        cancelLabel="Cancel"
        onCancel={closeConfirm}
        onConfirm={confirmFinish}
        message={
          <div className="course-lifecycle-confirm">
            {loadingCount ? (
              <p>Checking how many students currently have access…</p>
            ) : loadError ? (
              <p className="admin-error">{loadError}</p>
            ) : (
              <>
                <p>
                  <strong>{studentPhrase}</strong>
                </p>
                <p>
                  Admissions will close. Students keep their enrollment history, but they will no
                  longer be able to open course content. Catalog visibility stays as you set it on
                  General.
                </p>
              </>
            )}
          </div>
        }
      />
    </>
  );
}
