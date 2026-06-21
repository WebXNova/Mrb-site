import { AIKEN_DRAFT_LOAD_BUTTON } from '../utils/aikenDraftImportCopy.js';

/**
 * @param {{ onAdd: () => void, onImport?: () => void, readOnly?: boolean }} props
 */
export default function QuizBuilderEmptyState({ onAdd, onImport, readOnly = false }) {
  if (readOnly) {
    return (
      <div className="qb-empty">
        <div className="qb-empty__icon" aria-hidden="true">
          ?
        </div>
        <h2 className="qb-empty__title">No questions added yet</h2>
        <p className="qb-empty__text">This test does not have any multiple choice questions.</p>
      </div>
    );
  }

  return (
    <div className="qb-empty">
      <div className="qb-empty__icon" aria-hidden="true">
        +
      </div>
      <h2 className="qb-empty__title">No questions added yet</h2>
      <p className="qb-empty__text">
        Click <strong>Add question</strong> to build manually, or import an Aiken file to start.
      </p>
      <div className="qb-empty__actions">
        <button type="button" className="btn btn--primary" onClick={onAdd}>
          Add question
        </button>
        {onImport ? (
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onImport}
            title="Preview file contents, then save questions to this test draft"
          >
            {AIKEN_DRAFT_LOAD_BUTTON}
          </button>
        ) : null}
      </div>
    </div>
  );
}
