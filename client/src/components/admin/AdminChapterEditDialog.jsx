import { useEffect, useRef } from 'react';
import AdminChapterFormFields from './AdminChapterFormFields';

const TITLE_ID = 'chapterEditHeading';

/**
 * Isolated privileged edit surface (native dialog). Create flow stays separate.
 *
 * @param {{
 *   dialogRef: React.RefObject<HTMLDialogElement | null>,
 *   layoutEnabled: boolean,
 *   detailLoading: boolean,
 *   formState: Record<string, unknown>,
 *   onFormChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void,
 *   lockedTitles: { course?: string, subject?: string },
 *   mutationBusy: boolean,
 *   chapterFormDisabled: boolean,
 *   dismissLocked: boolean,
 *   formError: string,
 *   onSubmit: (e: React.FormEvent) => void,
 *   onDismiss: () => void,
 *   isSubmitting: boolean,
 * }} props
 */
export default function AdminChapterEditDialog({
  dialogRef,
  layoutEnabled,
  detailLoading,
  formState,
  onFormChange,
  lockedTitles,
  mutationBusy,
  chapterFormDisabled,
  dismissLocked,
  formError,
  onSubmit,
  onDismiss,
  isSubmitting,
}) {
  const didOpenRef = useRef(false);

  function onBackdropClick(event) {
    if (/** @type {HTMLElement} */ (event.target)?.nodeName !== 'DIALOG') return;
    if (dismissLocked) return;
    onDismiss();
  }

  function onDialogCancel(event) {
    if (dismissLocked) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    onDismiss();
  }

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    function onClosed() {
      didOpenRef.current = false;
    }
    el.addEventListener('close', onClosed);
    return () => el.removeEventListener('close', onClosed);
  }, [dialogRef]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const shouldModal = Boolean(layoutEnabled);

    if (shouldModal) {
      if (!el.open) {
        try {
          el.showModal();
        } catch {
          /* ignore duplicate showModal */
        }
      }
      didOpenRef.current = true;
      if (!detailLoading && !chapterFormDisabled) {
        queueMicrotask(() => {
          const focusTarget = el.querySelector('[data-focus-edit="true"]');
          if (focusTarget instanceof HTMLElement) focusTarget.focus();
        });
      }
    } else if (el.open || didOpenRef.current) {
      el.close();
      didOpenRef.current = false;
    }
  }, [layoutEnabled, detailLoading, chapterFormDisabled, dialogRef]);

  if (!layoutEnabled) return null;

  return (
    <dialog
      ref={dialogRef}
      className="admin-chapter-dialog"
      aria-labelledby={TITLE_ID}
      aria-busy={detailLoading || isSubmitting}
      onClick={onBackdropClick}
      onCancel={onDialogCancel}
    >
      <div className="admin-chapter-dialog__inner" onClick={(e) => e.stopPropagation()}>
        <section className="admin-card" style={{ margin: 0, borderRadius: 'inherit', boxShadow: 'none', border: 'none' }}>
          <h3 className="heading-4" id={TITLE_ID}>
            Edit chapter
          </h3>

          <p id="chapterEditOverview" className="admin-muted" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            Title, description, and order can be adjusted. Course and subject cannot change after creation.
          </p>

          {detailLoading ? (
            <div className="admin-chapter-dialog__loading-wrap" style={{ marginTop: '1rem' }}>
              <p className="admin-muted" role="status" aria-busy="true">
                Loading chapter…
              </p>
              <div className="admin-actions" style={{ marginTop: '1rem', paddingBottom: '0.25rem' }}>
                <button type="button" className="btn btn--secondary" onClick={onDismiss} disabled={dismissLocked}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <form className="admin-form-grid" style={{ marginTop: '1rem' }} onSubmit={onSubmit} noValidate aria-busy={isSubmitting}>
              <AdminChapterFormFields
                variant="edit"
                fieldIdPrefix="chapterEdit"
                formState={formState}
                onFormChange={onFormChange}
                sortedCourses={[]}
                sortedFormSubjects={[]}
                isLoadingCourses={false}
                isLoadingFormSubjects={false}
                lockedTitles={lockedTitles}
                courseControlDisabled
                subjectSelectDisabled
                fieldsDisabled={chapterFormDisabled}
              >
                {formError ? (
                  <p id="chapterEditAlert" className="admin-error" role="alert" style={{ gridColumn: '1 / -1' }}>
                    {formError}
                  </p>
                ) : null}

                <div className="admin-actions" style={{ gridColumn: '1 / -1' }}>
                  <button type="submit" className="btn btn--primary" disabled={chapterFormDisabled}>
                    {isSubmitting ? 'Saving…' : 'Save changes'}
                  </button>
                  <button type="button" className="btn btn--secondary" onClick={onDismiss} disabled={chapterFormDisabled}>
                    Cancel
                  </button>
                </div>
              </AdminChapterFormFields>
            </form>
          )}
        </section>
      </div>
    </dialog>
  );
}
