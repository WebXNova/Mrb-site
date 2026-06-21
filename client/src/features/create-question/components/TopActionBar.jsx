import { adminRoute } from '../../../config/adminPaths';
import { Link } from 'react-router-dom';

/**
 * Top action bar — UI shell only in Phase 1.
 * Save / draft handlers are wired but disabled until useSaveFlow is implemented.
 */
export default function TopActionBar({
  isDirty = false,
  canSave = false,
  onSave,
  onSaveDraft,
  onReset,
  onOpenStudentView,
  disabled = false,
  backTo = adminRoute(),
  backLabel = 'Back',
  saveImplemented = false,
}) {
  return (
    <header className="cq-action-bar" aria-label="Question actions">
      <div className="cq-action-bar__left">
        <Link className="btn btn--ghost btn--sm" to={backTo}>
          ← {backLabel}
        </Link>
        <div>
          <h1 className="heading-3 cq-action-bar__title">Question Authoring</h1>
          <p className="admin-stat-card__label cq-action-bar__subtitle">
            Write and format your question
          </p>
        </div>
        {isDirty ? (
          <span className="cq-action-bar__unsaved" aria-live="polite">
            <span className="cq-action-bar__unsaved-dot" aria-hidden="true" />
            Unsaved changes
          </span>
        ) : null}
      </div>

      <div className="cq-action-bar__actions">
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={onOpenStudentView}
          disabled={disabled}
        >
          Student view
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onReset}
          disabled={disabled || !isDirty}
        >
          Reset
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={onSaveDraft}
          disabled={disabled || !saveImplemented}
          title={saveImplemented ? 'Save draft' : 'Save draft — coming soon'}
        >
          Save draft
        </button>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={onSave}
          disabled={disabled || !saveImplemented || !canSave}
          title={saveImplemented ? 'Save question' : 'Save question — coming soon'}
        >
          Save question
        </button>
      </div>
    </header>
  );
}
