import { useEffect, useMemo, useRef } from 'react';
import StudentQuestionForm from '../questions/StudentQuestionForm';
import {
  sanitizeQuestionAttachmentUrl,
  sanitizeQuestionPlainText,
  sanitizeTeacherAnswerAttachmentUrl,
} from '../../utils/sanitizeQuestionText';
import { qaSubjectAvatarLetters, qaSubjectEmoji } from '../../../constants/qaSubjects';
import { STUDENT_QUESTION_STATUS } from '../../utils/studentQuestionStatus';

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
}

function formatDatePill(iso) {
  if (!iso) return 'Today';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Today';
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function dayKey(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toDateString();
}

function ThreadMessage({ message }) {
  const isTeacherInitiated = Boolean(message.isTeacherInitiated);
  const safeBody = sanitizeQuestionPlainText(message.body);
  const safeAnswer = message.answer ? sanitizeQuestionPlainText(message.answer) : '';
  const attachmentUrl = sanitizeQuestionAttachmentUrl(message.attachmentUrl);
  const audioUrl = sanitizeQuestionAttachmentUrl(message.audioUrl);
  const answerImageUrl = sanitizeTeacherAnswerAttachmentUrl(message.answerImageUrl);
  const answerAudioUrl = sanitizeTeacherAnswerAttachmentUrl(message.answerAudioUrl);
  const isAnswered = message.status === STUDENT_QUESTION_STATUS.ANSWERED && Boolean(safeAnswer);

  if (isTeacherInitiated && isAnswered) {
    return (
      <div className="tq-wa-chat__row tq-wa-chat__row--in">
        <div className="tq-wa-chat__bubble tq-wa-chat__bubble--in">
          <span className="tq-wa-chat__sender">Teacher</span>
          <p className="tq-wa-chat__text">{safeAnswer}</p>
          {answerImageUrl ? (
            <a className="tq-wa-chat__attach-link" href={answerImageUrl} target="_blank" rel="noopener noreferrer">
              <img className="tq-wa-chat__attach-img" src={answerImageUrl} alt="Teacher attachment" />
            </a>
          ) : null}
          {answerAudioUrl ? (
            <audio className="tq-wa-chat__attach-audio" controls src={answerAudioUrl} aria-label="Teacher voice message">
              <track kind="captions" />
            </audio>
          ) : null}
          <span className="tq-wa-chat__meta">
            <time dateTime={message.answeredAt || message.updatedAt}>
              {formatWhen(message.answeredAt || message.updatedAt)}
            </time>
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="tq-wa-chat__row tq-wa-chat__row--out">
        <div className="tq-wa-chat__bubble tq-wa-chat__bubble--out tq-wa-chat__bubble--student">
          <span className="tq-wa-chat__sender tq-wa-chat__sender--you">You</span>
          <p className="tq-wa-chat__text">{safeBody}</p>
          {attachmentUrl ? (
            <a className="tq-wa-chat__attach-link" href={attachmentUrl} target="_blank" rel="noopener noreferrer">
              <img className="tq-wa-chat__attach-img" src={attachmentUrl} alt="Your attachment" />
            </a>
          ) : null}
          {audioUrl ? (
            <audio className="tq-wa-chat__attach-audio" controls src={audioUrl} aria-label="Your voice message">
              <track kind="captions" />
            </audio>
          ) : null}
          <span className="tq-wa-chat__meta">
            <time dateTime={message.createdAt}>{formatWhen(message.createdAt)}</time>
            <span className="tq-wa-chat__ticks" aria-label="Sent">✓</span>
          </span>
        </div>
      </div>

      {isAnswered ? (
        <div className="tq-wa-chat__row tq-wa-chat__row--in">
          <div className="tq-wa-chat__bubble tq-wa-chat__bubble--in">
            <span className="tq-wa-chat__sender">Teacher</span>
            <p className="tq-wa-chat__text">{safeAnswer}</p>
            {answerImageUrl ? (
              <a className="tq-wa-chat__attach-link" href={answerImageUrl} target="_blank" rel="noopener noreferrer">
                <img className="tq-wa-chat__attach-img" src={answerImageUrl} alt="Teacher attachment" />
              </a>
            ) : null}
            {answerAudioUrl ? (
              <audio className="tq-wa-chat__attach-audio" controls src={answerAudioUrl} aria-label="Teacher voice reply">
                <track kind="captions" />
              </audio>
            ) : null}
            <span className="tq-wa-chat__meta">
              <time dateTime={message.answeredAt || message.updatedAt}>
                {formatWhen(message.answeredAt || message.updatedAt)}
              </time>
            </span>
          </div>
        </div>
      ) : (
        <div className="tq-wa-chat__row tq-wa-chat__row--system">
          <p className="tq-wa-chat__system-msg">Waiting for your teacher&apos;s reply…</p>
        </div>
      )}
    </>
  );
}

export default function StudentQuestionConversation({
  thread,
  loading,
  error,
  onQuestionSubmitted,
  onNext,
  onPrevious,
  canGoNext,
  canGoPrevious,
  onBack,
  showBack,
}) {
  const messagesEndRef = useRef(null);

  const subjectLabel = useMemo(
    () => sanitizeQuestionPlainText(thread?.subjectLabel || 'Subject'),
    [thread?.subjectLabel]
  );

  const messages = Array.isArray(thread?.messages) ? thread.messages : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, loading]);

  if (loading) {
    return (
      <section className="tq-ws__center tq-ws__center--empty" aria-busy="true">
        <p className="admin-stat-card__label">Loading conversation…</p>
      </section>
    );
  }

  if (error || !thread) {
    return (
      <section className="tq-ws__center tq-ws__center--empty">
        <p className="admin-error" role="alert">{error || 'Select a subject chat from the list.'}</p>
      </section>
    );
  }

  const avatar = thread.subjectSlug
    ? qaSubjectEmoji(thread.subjectSlug)
    : qaSubjectAvatarLetters(thread.subjectSlug || subjectLabel);
  const statusLine = sanitizeQuestionPlainText(thread.courseName || 'Course');
  let lastDay = '';

  return (
    <section className="tq-ws__center tq-wa-chat" aria-label="Subject conversation">
      <header className="tq-wa-chat__header">
        {showBack ? (
          <button type="button" className="tq-wa-chat__icon-btn tq-wa-chat__back-btn" onClick={onBack} aria-label="Back to subjects">
            ←
          </button>
        ) : (
          <div className="tq-wa-chat__header-nav">
            <button type="button" className="tq-wa-chat__icon-btn" onClick={onPrevious} disabled={!canGoPrevious} aria-label="Previous subject">
              ←
            </button>
            <button type="button" className="tq-wa-chat__icon-btn" onClick={onNext} disabled={!canGoNext} aria-label="Next subject">
              →
            </button>
          </div>
        )}
        <div className="tq-wa-chat__avatar" aria-hidden>
          {avatar}
        </div>
        <div className="tq-wa-chat__header-text">
          <h2 className="tq-wa-chat__contact-name">{subjectLabel}</h2>
          <p className="tq-wa-chat__contact-status">{statusLine}</p>
        </div>
      </header>

      <div className="tq-wa-chat__messages" role="log" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 ? (
          <div className="tq-wa-chat__row tq-wa-chat__row--system">
            <p className="tq-wa-chat__system-msg">No messages yet. Say hello below to start the chat.</p>
          </div>
        ) : null}

        {messages.map((message) => {
          const day = dayKey(message.createdAt);
          const showDate = day && day !== lastDay;
          if (showDate) lastDay = day;

          return (
            <div key={message.id}>
              {showDate ? (
                <div className="tq-wa-chat__date-pill">
                  <span>{formatDatePill(message.createdAt)}</span>
                </div>
              ) : null}
              <ThreadMessage message={message} />
            </div>
          );
        })}
        <div ref={messagesEndRef} className="tq-wa-chat__scroll-anchor" aria-hidden />
      </div>

      <footer className="tq-wa-chat__footer">
        <div className="tq-wa-chat__composer-wrap">
          <StudentQuestionForm
            onSubmitted={onQuestionSubmitted}
            subjectId={thread.subjectId}
            variant="whatsapp"
          />
        </div>
      </footer>
    </section>
  );
}
