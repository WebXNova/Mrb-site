import CKEditorWrapper from './CKEditorWrapper.jsx';
import { sanitizeExplanationHtml } from '../utils/sanitizeExplanationHtml.js';

/**
 * Secure Explanation Editor — optional MCQ solution / reasoning field.
 *
 * Security model (same as QuestionEditor):
 * - CKEditor output is NEVER trusted
 * - Raw editor.getData() never enters parent state (sanitized in CKEditorWrapper)
 * - sanitizeExplanationHtml() strips script, iframe, svg, object, embed, event handlers
 * - Rejects javascript:, data:, vbscript: URLs
 * - Preview uses plain text only (prepareForPreview in parent)
 * - sanitizeExplanationHtml() runs again before API payload (defense in depth)
 * - Backend re-validates on write (applyQuestionWriteSecurity)
 *
 * Supported formatting: bold, italic, underline, lists, tables, alignment, sub/superscript.
 * No file uploads in this editor.
 *
 * Data flow:
 *   Teacher Input → CKEditor → sanitizeExplanationHtml → onChange(safeHtml) → explanation state
 *   explanation state → sanitizeExplanationHtml → save payload
 *
 * Controlled component — no hidden business state. Parent owns all form state.
 *
 * @param {object} props
 * @param {string} [props.value] — sanitized HTML draft (controlled)
 * @param {(cleanHtml: string) => void} [props.onChange] — receives sanitized HTML only
 * @param {string} [props.error]
 * @param {boolean} [props.disabled]
 * @param {string} [props.id]
 * @param {string} [props.label]
 * @param {string} [props.placeholder]
 */
export default function ExplanationEditor({
  value = '',
  onChange,
  error = '',
  disabled = false,
  id = 'cq-explanation-editor',
  label = 'Explanation text',
  placeholder = 'Why is the correct answer correct? (optional)',
}) {
  return (
    <section className="admin-card cq-section" aria-labelledby="cq-explanation-heading">
      <h2 id="cq-explanation-heading" className="heading-4">
        Explanation
      </h2>
      <p className="admin-field__hint cq-section__hint">
        Optional — solution, reasoning, formulas, or tables. Rich text is sanitized on every change.
      </p>

      <div className="admin-field">
        <CKEditorWrapper
          id={id}
          label={label}
          value={value}
          onChange={onChange}
          sanitize={sanitizeExplanationHtml}
          disabled={disabled}
          invalid={Boolean(error)}
          placeholder={placeholder}
        />
        {error ? (
          <div className="admin-field__error" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </section>
  );
}
