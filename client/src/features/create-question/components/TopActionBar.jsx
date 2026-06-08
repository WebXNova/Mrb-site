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
  disabled = false,
  backTo = '/admin',
  backLabel = 'Back',
}) {
  return (
    <header className="cq-action-bar admin-card" aria-label="Question actions">
      <div className="cq-action-bar__left">
        <Link className="btn btn--ghost btn--sm" to={backTo}>
          ← {backLabel}
        </Link>
        <div>
          <h1 className="heading-3 cq-action-bar__title">Create Question</h1>
          <p className="admin-stat-card__label cq-action-bar__subtitle">
            Question Bank · Phase 1 architecture
            {isDirty ? ' · Unsaved changes' : ''}
          </p>
        </div>
      </div>

      <div className="cq-action-bar__actions">
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
          disabled
          title="Draft save — not implemented in Phase 1"
        >
          Save draft
        </button>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={onSave}
          disabled={disabled || !canSave}
          title="Save — not implemented in Phase 1"
        >
          Save question
        </button>
      </div>
    </header>
  );
}
