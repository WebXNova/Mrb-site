import { useCallback, useEffect } from 'react';
import RichTextEditorHost from '../editor/RichTextEditorHost.jsx';
import { useEditorRibbon } from '../ribbon/EditorRibbonProvider.jsx';
import { prepareForPreview } from '../utils/prepareForPreview.js';
import { sanitizeEditorOutput } from '../utils/sanitizeEditorOutput.js';

/**
 * Question stem — inline images, tables, formulas inside the document editor.
 */
export default function QuestionStemEditor({
  question,
  error = '',
  onQuestionChange,
  disabled = false,
}) {
  const { registerEditor, unregisterEditor, setActiveEditorId } = useEditorRibbon();

  const handleEditorReady = useCallback(
    (editor) => {
      registerEditor('question', editor);
      const tracker = editor.ui?.focusTracker;
      if (tracker?.on) {
        tracker.on('change:isFocused', (_evt, _name, isFocused) => {
          if (isFocused) setActiveEditorId('question');
        });
      }
    },
    [registerEditor, setActiveEditorId]
  );

  useEffect(() => {
    return () => unregisterEditor('question');
  }, [unregisterEditor]);

  function handleChange(cleanHtml) {
    const plainText = prepareForPreview(cleanHtml);
    onQuestionChange(plainText, cleanHtml);
  }

  return (
    <section className="qaw-stem" aria-labelledby="qaw-stem-heading">
      <h2 id="qaw-stem-heading" className="qaw-section-title">
        Question
      </h2>
      <div className="qaw-document-surface">
        <RichTextEditorHost
          editorId="question"
          value={question.textHtmlDraft}
          onChange={handleChange}
          onEditorReady={handleEditorReady}
          disabled={disabled}
          invalid={Boolean(error)}
          placeholder="Write your question here. Use the ribbon to format text, insert images, tables, or formulas…"
          ariaLabel="Question text editor"
          sanitize={sanitizeEditorOutput}
        />
      </div>
      {error ? (
        <div className="admin-field__error qaw-stem__error" role="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}
