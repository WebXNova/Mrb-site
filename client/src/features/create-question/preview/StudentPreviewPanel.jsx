import { memo } from 'react';
import SanitizedBlockRenderer from './SanitizedBlockRenderer.jsx';
import StudentPreviewOptions from './StudentPreviewOptions.jsx';

/**
 * Real-time Student Preview — side-by-side authoring mirror.
 * Updates instantly from StudentPreviewModel; no refresh control.
 */
function StudentPreviewPanel({ model, showHeader = true }) {
  return (
    <article className="sp-panel" aria-labelledby={showHeader ? 'sp-panel-heading' : undefined}>
      {showHeader ? (
        <header className="sp-panel__header">
          <div>
            <h2 id="sp-panel-heading" className="sp-panel__title">
              Student view
            </h2>
            <p className="sp-panel__subtitle">Live preview — updates as you type</p>
          </div>
          <span className="sp-panel__live" aria-live="polite">
            <span className="sp-panel__live-dot" aria-hidden="true" />
            Live
          </span>
        </header>
      ) : (
        <p className="sp-panel__subtitle sp-panel__subtitle--inline" aria-live="polite">
          <span className="sp-panel__live-dot" aria-hidden="true" />
          Live preview — updates as you type
        </p>
      )}

      <div className="sp-card">
        <div className="sp-card__section">
          <h3 className="sp-card__label">Question</h3>
          <SanitizedBlockRenderer
            blocks={model.question.blocks}
            emptyLabel="Your question will appear here"
            className="sp-card__question"
          />
        </div>

        <div className="sp-card__section">
          <h3 className="sp-card__label">Answer choices</h3>
          <StudentPreviewOptions options={model.options} />
        </div>

        <div className="sp-card__section sp-card__section--explanation">
          <h3 className="sp-card__label">Explanation</h3>
          <p className="sp-card__explanation-note">
            Shown to students after submission or review (if enabled by test settings).
          </p>
          <SanitizedBlockRenderer
            blocks={model.explanation.blocks}
            emptyLabel="No explanation yet"
            className="sp-card__explanation"
          />
        </div>
      </div>
    </article>
  );
}

export default memo(StudentPreviewPanel);
