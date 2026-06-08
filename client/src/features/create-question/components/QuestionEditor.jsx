import CKEditorWrapper from './CKEditorWrapper.jsx';
import { prepareForPreview } from '../utils/prepareForPreview.js';

/**
 * Question body editor — CKEditor with frontend sanitization gate.
 * All HTML must pass sanitization before preview/render.
 */
export default function QuestionEditor({
  question,
  error = '',
  onQuestionChange,
  disabled = false,
}) {
  function handleEditorChange(cleanHtml) {
    const plainText = prepareForPreview(cleanHtml);
    onQuestionChange(plainText, cleanHtml);
  }

  return (
    <section className="admin-card cq-section" aria-labelledby="cq-question-heading">
      <h2 id="cq-question-heading" className="heading-4">
        Question
      </h2>
      <p className="admin-field__hint cq-section__hint">
        Rich text is sanitized on every change before entering form state.
      </p>

      <div className="admin-field">
        <CKEditorWrapper
          id="cq-question-editor"
          label="Question text *"
          value={question.textHtmlDraft}
          onChange={handleEditorChange}
          disabled={disabled}
          invalid={Boolean(error)}
          placeholder="Enter the question stem…"
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
