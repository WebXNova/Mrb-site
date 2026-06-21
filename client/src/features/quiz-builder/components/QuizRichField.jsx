import { useCallback, useEffect } from 'react';
import RichTextEditorHost from '../../create-question/editor/RichTextEditorHost.jsx';
import { sanitizeEditorOutput } from '../../create-question/utils/sanitizeEditorOutput.js';
import { useQuizCardRibbon } from '../ribbon/QuizCardEditorProvider.jsx';

/**
 * Rich text field controlled by the per-card ribbon (no inline CKEditor toolbar).
 */
export default function QuizRichField({
  editorId,
  value = '',
  onChange,
  disabled = false,
  placeholder = 'Enter text…',
  ariaLabel = 'Rich text field',
  compact = false,
}) {
  const { registerEditor, unregisterEditor, setActiveEditorId } = useQuizCardRibbon();

  const handleEditorReady = useCallback(
    (editor) => {
      registerEditor(editorId, editor);
      const tracker = editor.ui?.focusTracker;
      if (tracker?.on) {
        tracker.on('change:isFocused', (_evt, _name, isFocused) => {
          if (isFocused) setActiveEditorId(editorId);
        });
      }
    },
    [editorId, registerEditor, setActiveEditorId]
  );

  useEffect(() => {
    return () => unregisterEditor(editorId);
  }, [editorId, unregisterEditor]);

  return (
    <div className={`qb-rich-field${compact ? ' qb-rich-field--compact' : ''}`}>
      <RichTextEditorHost
        editorId={editorId}
        value={value}
        onChange={onChange}
        onEditorReady={handleEditorReady}
        disabled={disabled}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        sanitize={sanitizeEditorOutput}
      />
    </div>
  );
}
