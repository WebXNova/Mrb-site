import { useEffect, useMemo, useState } from 'react';
import {
  MAX_ANSWER_CHARS,
  MIN_ANSWER_WORDS,
} from '../../utils/teacherAnswerValidation';
import { useTeacherAnswerForm } from '../../hooks/useTeacherAnswerForm';
import { useTeacherAnswerDraft } from '../../hooks/useTeacherAnswerDraft';
import TeacherAnswerComposer from './TeacherAnswerComposer';

function parseSubmitError(message) {
  if (typeof message !== 'string' || !message.trim()) {
    return { text: message || '', reference: null };
  }
  const match = message.match(/^(.+?)\s+Reference:\s*(.+)$/);
  if (!match) return { text: message.trim(), reference: null };
  return { text: match[1].trim(), reference: match[2].trim() };
}

export default function TeacherAnswerForm({
  questionId,
  threadId,
  onAnswered,
  templateInsert = null,
  variant = 'default',
}) {
  const draftKey = questionId ? String(questionId) : threadId ? `thread:${threadId}` : null;
  const { loadDraft, saveDraft, clearDraft } = useTeacherAnswerDraft(draftKey);
  const [draftSeed, setDraftSeed] = useState(() => loadDraft());

  useEffect(() => {
    setDraftSeed(loadDraft());
  }, [draftKey, loadDraft]);

  useEffect(() => {
    if (!templateInsert?.text) return;
    setDraftSeed((prev) => (prev ? `${prev}\n\n${templateInsert.text}` : templateInsert.text));
  }, [templateInsert?.key]);

  const initialAnswer = useMemo(() => draftSeed, [draftSeed, draftKey]);

  const form = useTeacherAnswerForm({
    questionId,
    threadId,
    onAnswered: (detail) => {
      clearDraft();
      onAnswered?.(detail);
    },
    initialAnswer,
    onAnswerChange: saveDraft,
  });

  const answerHint = `At least ${MIN_ANSWER_WORDS} words · or send media only`;
  const submitErrorParts = form.submitError ? parseSubmitError(form.submitError) : null;
  const charCounter = `${form.answer.length.toLocaleString()} / ${MAX_ANSWER_CHARS.toLocaleString()}`;
  const charCounterWarn = form.answer.length > MAX_ANSWER_CHARS * 0.9;

  const isWhatsApp = variant === 'whatsapp';

  return (
    <form
      className={`sqachat-form tq-detail__answer-form${isWhatsApp ? ' tq-wa-chat__answer-form' : ''}`}
      onSubmit={form.handleSubmit}
      noValidate
    >
      {!isWhatsApp ? (
        <div className="sqachat-form__card sqachat-form__card--composer tq-detail__answer-card">
          <label className="sqachat-form__composer-label" htmlFor="ta-body">
            Your answer
            <span className="premium-field__required" aria-hidden>
              *
            </span>
          </label>
          <TeacherAnswerComposer
            answer={form.answer}
            onAnswerChange={form.setAnswer}
            charCounter={charCounter}
            charCounterWarn={charCounterWarn}
            answerHint={answerHint}
            fieldErrors={form.fieldErrors}
            file={form.file}
            previewUrl={form.previewUrl}
            onPickFile={form.onPickFile}
            onClearFile={form.clearFile}
            audio={form.audio}
            canSubmit={form.canSubmit}
            submitting={form.submitting}
            hasMedia={form.hasMedia}
          />
        </div>
      ) : (
        <TeacherAnswerComposer
          answer={form.answer}
          onAnswerChange={form.setAnswer}
          charCounter={charCounter}
          charCounterWarn={charCounterWarn}
          answerHint={answerHint}
          fieldErrors={form.fieldErrors}
          file={form.file}
          previewUrl={form.previewUrl}
          onPickFile={form.onPickFile}
          onClearFile={form.clearFile}
          audio={form.audio}
          canSubmit={form.canSubmit}
          submitting={form.submitting}
          hasMedia={form.hasMedia}
        />
      )}

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
