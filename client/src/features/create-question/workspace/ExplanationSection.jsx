import { useCallback, useEffect } from 'react';
import RichTextEditorHost from '../editor/RichTextEditorHost.jsx';
import { useEditorRibbon } from '../ribbon/EditorRibbonProvider.jsx';
import { prepareForPreview } from '../utils/prepareForPreview.js';
import { sanitizeExplanationHtml } from '../utils/sanitizeExplanationHtml.js';

/**
 * Optional explanation block — same editor host, separate ribbon focus target.
 */
export default function ExplanationSection({
  explanation,
  error = '',
  onExplanationChange,
  disabled = false,
}) {
  const { registerEditor, unregisterEditor, setActiveEditorId } = useEditorRibbon();

  const handleEditorReady = useCallback(
    (editor) => {
      registerEditor('explanation', editor);
      const tracker = editor.ui?.focusTracker;
      if (tracker?.on) {
        tracker.on('change:isFocused', (_evt, _name, isFocused) => {
          if (isFocused) setActiveEditorId('explanation');
        });
      }
    },
    [registerEditor, setActiveEditorId]
  );

  useEffect(() => {
    return () => unregisterEditor('explanation');
  }, [unregisterEditor]);

  function handleChange(cleanHtml) {
    const plainText = prepareForPreview(cleanHtml);
    onExplanationChange(plainText, cleanHtml);
  }

  return (
    <section className="qaw-explanation" aria-labelledby="qaw-explanation-heading">
      <h2 id="qaw-explanation-heading" className="qaw-section-title">
        Explanation
        <span className="qaw-section-title__optional"> optional</span>
      </h2>
      <p className="qaw-section-hint">
        Solution, reasoning, or formulas — sanitized on every change.
      </p>
      <div className="qaw-document-surface qaw-document-surface--compact">
        <RichTextEditorHost
          editorId="explanation"
          value={explanation.textHtmlDraft}
          onChange={handleChange}
          onEditorReady={handleEditorReady}
          disabled={disabled}
          invalid={Boolean(error)}
          placeholder="Why is the correct answer correct?"
          ariaLabel="Explanation editor"
          sanitize={sanitizeExplanationHtml}
        />
      </div>
      {error ? (
        <div className="admin-field__error" role="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}
