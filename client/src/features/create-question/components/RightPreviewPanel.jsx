import LivePreview from './LivePreview.jsx';

/**
 * Right column — read-only preview driven by sanitized plain-text mirrors.
 */
export default function RightPreviewPanel({
  visible,
  metadata,
  questionPreviewText,
  questionImage,
  options,
  explanationPreviewText,
  onToggleVisible,
}) {
  if (!visible) {
    return (
      <aside className="cq-preview-panel cq-preview-panel--collapsed">
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => onToggleVisible(true)}
        >
          Show preview
        </button>
      </aside>
    );
  }

  return (
    <aside className="cq-preview-panel" aria-label="Question preview">
      <div className="cq-preview-panel__toolbar">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => onToggleVisible(false)}
        >
          Hide preview
        </button>
      </div>
      <LivePreview
        metadata={metadata}
        questionPreviewText={questionPreviewText}
        questionImage={questionImage}
        options={options}
        explanationPreviewText={explanationPreviewText}
      />
    </aside>
  );
}
