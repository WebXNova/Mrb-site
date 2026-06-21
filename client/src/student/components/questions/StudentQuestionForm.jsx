import { Link } from 'react-router-dom';
import PremiumFormField from '../../../admin/components/courses/PremiumFormField';
import {
  MAX_QUESTION_BODY_LENGTH,
  MIN_QUESTION_CHARS,
  MIN_WORDS_TEXT_ONLY,
  MIN_WORDS_WITH_MEDIA,
} from '../../../utils/qaQuestionValidation';
import StudentQuestionComposer from './StudentQuestionComposer';
import { useStudentQuestionForm } from '../../hooks/useStudentQuestionForm';

function parseSubmitError(message) {
  if (typeof message !== 'string' || !message.trim()) {
    return { text: message || '', reference: null };
  }
  const match = message.match(/^(.+?)\s+Reference:\s*(.+)$/);
  if (!match) return { text: message.trim(), reference: null };
  return { text: match[1].trim(), reference: match[2].trim() };
}

export default function StudentQuestionForm({ onSubmitted, subjectId = null, variant = 'default' }) {
  const isWhatsApp = variant === 'whatsapp';
  const form = useStudentQuestionForm({
    onSubmitted,
    initialSubjectId: subjectId,
    lockSubject: isWhatsApp && Boolean(subjectId),
    inlineSubmit: isWhatsApp,
  });

  if (form.loadingContext) {
    if (isWhatsApp) {
      return <p className="tq-wa-chat__composer-loading">Loading…</p>;
    }
    return (
      <section className="admin-card sqachat-panel" aria-busy="true" aria-label="Loading question form">
        <p className="admin-stat-card__label">Loading your course and subjects…</p>
      </section>
    );
  }

  if (form.contextError) {
    const contextErrorParts = parseSubmitError(form.contextError);
    return (
      <section className="admin-card sqachat-panel">
        <div className="sqachat-form__alert" role="alert">
          <p className="sqachat-form__alert-text">{contextErrorParts.text}</p>
          {contextErrorParts.reference ? (
            <p className="sqachat-form__alert-ref">
              <abbr
                title={`Reference: ${contextErrorParts.reference}`}
                className="sqachat-form__alert-ref-id"
              >
                Ref {contextErrorParts.reference.slice(0, 8)}…
              </abbr>
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  if (form.success && !isWhatsApp) {
    return (
      <section className="admin-card sqachat-panel sqachat-form__success" role="status" aria-live="polite">
        <h3 className="heading-4 sqachat-form__success-title">{form.success.message}</h3>
        <p className="admin-stat-card__label">{form.success.detail}</p>
        <div className="sqachat-form__success-actions">
          <Link className="btn btn--primary btn--sm" to={`/student/questions/${form.success.id}`}>
            View your question
          </Link>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={form.askAnother}
          >
            Ask another question
          </button>
        </div>
      </section>
    );
  }

  const questionHint = form.hasMedia
    ? `At least ${MIN_WORDS_WITH_MEDIA} words with media, or send media only.`
    : `At least ${MIN_WORDS_TEXT_ONLY} words.`;

  const submitErrorParts = form.submitError ? parseSubmitError(form.submitError) : null;
  const charCounter = `${form.question.length.toLocaleString()} / ${MAX_QUESTION_BODY_LENGTH.toLocaleString()}`;
  const charCounterWarn = form.question.length > MAX_QUESTION_BODY_LENGTH * 0.9;

  if (isWhatsApp) {
    return (
      <form className="sqachat-form tq-wa-chat__answer-form" onSubmit={form.handleSubmit} noValidate>
        <StudentQuestionComposer
          question={form.question}
          onQuestionChange={form.setQuestion}
          words={form.words}
          hasMedia={form.hasMedia}
          charCounter={charCounter}
          charCounterWarn={charCounterWarn}
          questionHint={questionHint}
          fieldErrors={form.fieldErrors}
          file={form.file}
          previewUrl={form.previewUrl}
          onPickFile={form.onPickFile}
          onClearFile={form.clearFile}
          audio={form.audio}
          canSubmit={form.canSubmit}
          submitting={form.submitting}
        />
        {submitErrorParts ? (
          <div className="sqachat-form__alert" role="alert">
            <p className="sqachat-form__alert-text">{submitErrorParts.text}</p>
            {submitErrorParts.reference ? (
              <p className="sqachat-form__alert-ref">
                <abbr
                  title={`Reference: ${submitErrorParts.reference}`}
                  className="sqachat-form__alert-ref-id"
                >
                  Ref {submitErrorParts.reference.slice(0, 8)}…
                </abbr>
              </p>
            ) : null}
          </div>
        ) : null}
      </form>
    );
  }

  return (
    <form className="sqachat-form" onSubmit={form.handleSubmit} noValidate>
      <div className="sqachat-form__card sqachat-form__card--intro">
        <p className="sqachat-form__intro">
          <span className="sqachat-form__intro-text">
            Ask your question clearly and provide enough detail so your teacher can help you effectively.
          </span>
          {form.course?.title ? (
            <span className="sqachat-form__course-pill">
              Course: <strong>{form.course.title}</strong>
            </span>
          ) : null}
        </p>
      </div>

      <div className="sqachat-form__card sqachat-form__card--composer">
        <PremiumFormField
          id="qa-subject"
          label="Subject"
          required
          hint="Only subjects from your enrolled course are listed."
          className="sqachat-form__subject-field"
          error={form.fieldErrors.subject}
        >
          <select
            id="qa-subject"
            className="sqachat-form__select"
            value={form.subjectId}
            onChange={(event) => form.setSubjectId(event.target.value)}
            disabled={form.submitting}
            aria-invalid={Boolean(form.fieldErrors.subject)}
          >
            <option value="" disabled>
              Select a subject
            </option>
            {form.subjects.map((subject) => (
              <option key={subject.id} value={String(subject.id)}>
                {subject.title}
              </option>
            ))}
          </select>
        </PremiumFormField>

        <div className="sqachat-form__composer-section">
          <label className="sqachat-form__composer-label" htmlFor="qa-body">
            Question text
            <span className="premium-field__required" aria-hidden>
              *
            </span>
          </label>

          <StudentQuestionComposer
            question={form.question}
            onQuestionChange={form.setQuestion}
            words={form.words}
            hasMedia={form.hasMedia}
            charCounter={charCounter}
            charCounterWarn={charCounterWarn}
            questionHint={questionHint}
            fieldErrors={form.fieldErrors}
            file={form.file}
            previewUrl={form.previewUrl}
            onPickFile={form.onPickFile}
            onClearFile={form.clearFile}
            audio={form.audio}
            canSubmit={form.canSubmit}
            submitting={form.submitting}
          />
        </div>
      </div>

      {submitErrorParts ? (
        <div className="sqachat-form__alert" role="alert">
          <p className="sqachat-form__alert-text">{submitErrorParts.text}</p>
          {submitErrorParts.reference ? (
            <p className="sqachat-form__alert-ref">
              <abbr
                title={`Reference: ${submitErrorParts.reference}`}
                className="sqachat-form__alert-ref-id"
              >
                Ref {submitErrorParts.reference.slice(0, 8)}…
              </abbr>
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
