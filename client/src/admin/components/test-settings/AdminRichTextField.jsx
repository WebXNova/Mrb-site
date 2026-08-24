import { useCallback } from 'react';
import { QuizCardEditorProvider } from '../../../features/quiz-builder/ribbon/QuizCardEditorProvider.jsx';
import QuizCardRibbon from '../../../features/quiz-builder/components/QuizCardRibbon.jsx';
import QuizRichField from '../../../features/quiz-builder/components/QuizRichField.jsx';
import { sanitizeEditorOutput } from '../../../features/create-question/utils/sanitizeEditorOutput.js';
import '../../../features/create-question/workspace/workspace.css';
import '../../../features/quiz-builder/styles/quiz-builder.css';

/**
 * Settings rich text — same ribbon + image upload path as quiz-builder section/question cards.
 * Passes initialActiveId so the toolbar renders enabled immediately (no focus required).
 */
export default function AdminRichTextField({
  editorId,
  value = '',
  onChange,
  disabled = false,
  placeholder = 'Enter text…',
  ariaLabel = 'Rich text field',
  compact = false,
}) {
  const handleChange = useCallback(
    (html) => {
      onChange?.(sanitizeEditorOutput(html));
    },
    [onChange]
  );

  return (
    <QuizCardEditorProvider disabled={disabled} initialActiveId={editorId}>
      <div className={`admin-rich-field${compact ? ' admin-rich-field--compact' : ''}`}>
        <div className="admin-rich-field__ribbon">
          <QuizCardRibbon />
        </div>
        <QuizRichField
          editorId={editorId}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          placeholder={placeholder}
          ariaLabel={ariaLabel}
          compact={compact}
        />
      </div>
    </QuizCardEditorProvider>
  );
}
