import { useEffect, useMemo, useRef, useState } from 'react';
import TeacherAnswerForm from '../questions/TeacherAnswerForm';
import { TEACHER_REPLY_TEMPLATES } from '../../constants/teacherReplyTemplates';
import {
  sanitizeQuestionAttachmentUrl,
  sanitizeQuestionPlainText,
  sanitizeTeacherAnswerAttachmentUrl,
} from '../../../student/utils/sanitizeQuestionText';
import { STUDENT_QUESTION_STATUS } from '../../../student/utils/studentQuestionStatus';

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

function studentAvatarLetters(name) {
  return String(name || 'S')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'S';
}

function ThreadMessage({ message, studentName }) {
  const isTeacherInitiated = Boolean(message.isTeacherInitiated);
  const safeBody = sanitizeQuestionPlainText(message.body);
  const safeAnswer = message.answer ? sanitizeQuestionPlainText(message.answer) : '';
  const attachmentUrl = sanitizeQuestionAttachmentUrl(message.attachmentUrl);
  const audioUrl = sanitizeQuestionAttachmentUrl(message.audioUrl);
  const answerImageUrl = sanitizeTeacherAnswerAttachmentUrl(message.answerImageUrl);
  const answerAudioUrl = sanitizeTeacherAnswerAttachmentUrl(message.answerAudioUrl);
  const isAnswered = message.status === STUDENT_QUESTION_STATUS.ANSWERED && Boolean(safeAnswer);
  const courseName = sanitizeQuestionPlainText(message.courseName || 'Course');
  const subjectName = sanitizeQuestionPlainText(message.subjectName || 'Subject');

  if (isTeacherInitiated && isAnswered) {
    return (
      <div className="tq-wa-chat__row tq-wa-chat__row--out">
        <div className="tq-wa-chat__bubble tq-wa-chat__bubble--out">
          <span className="tq-wa-chat__sender tq-wa-chat__sender--you">You</span>
          <p className="tq-wa-chat__text">{safeAnswer}</p>
          {answerImageUrl ? (
            <a className="tq-wa-chat__attach-link" href={answerImageUrl} target="_blank" rel="noopener noreferrer">
              <img className="tq-wa-chat__attach-img" src={answerImageUrl} alt="Your attachment" />
            </a>
          ) : null}
          {answerAudioUrl ? (
            <audio className="tq-wa-chat__attach-audio" controls src={answerAudioUrl} aria-label="Your voice message">
              <track kind="captions" />
            </audio>
          ) : null}
          <span className="tq-wa-chat__meta">
            <time dateTime={message.answeredAt || message.updatedAt}>
              {formatWhen(message.answeredAt || message.updatedAt)}
            </time>
            <span className="tq-wa-chat__ticks" aria-label="Sent">✓✓</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="tq-wa-chat__row tq-wa-chat__row--in">
        <div className="tq-wa-chat__bubble tq-wa-chat__bubble--in">
          <span className="tq-wa-chat__sender">{studentName}</span>
          <span className="tq-wa-chat__topic">{subjectName} · {courseName}</span>
          <p className="tq-wa-chat__text">{safeBody}</p>
          {attachmentUrl ? (
            <a className="tq-wa-chat__attach-link" href={attachmentUrl} target="_blank" rel="noopener noreferrer">
              <img className="tq-wa-chat__attach-img" src={attachmentUrl} alt="Attachment from student" />
            </a>
          ) : null}
          {audioUrl ? (
            <audio className="tq-wa-chat__attach-audio" controls src={audioUrl} aria-label="Voice message from student">
              <track kind="captions" />
            </audio>
          ) : null}
          <span className="tq-wa-chat__meta">
            <time dateTime={message.createdAt}>{formatWhen(message.createdAt)}</time>
          </span>
        </div>
      </div>

      {isAnswered ? (
        <div className="tq-wa-chat__row tq-wa-chat__row--out">
          <div className="tq-wa-chat__bubble tq-wa-chat__bubble--out">
            <span className="tq-wa-chat__sender tq-wa-chat__sender--you">You</span>
            <p className="tq-wa-chat__text">{safeAnswer}</p>
            {answerImageUrl ? (
              <a className="tq-wa-chat__attach-link" href={answerImageUrl} target="_blank" rel="noopener noreferrer">
                <img className="tq-wa-chat__attach-img" src={answerImageUrl} alt="Your attachment" />
              </a>
            ) : null}
            {answerAudioUrl ? (
              <audio className="tq-wa-chat__attach-audio" controls src={answerAudioUrl} aria-label="Your voice reply">
                <track kind="captions" />
              </audio>
            ) : null}
            <span className="tq-wa-chat__meta">
              <time dateTime={message.answeredAt || message.updatedAt}>
                {formatWhen(message.answeredAt || message.updatedAt)}
              </time>
              <span className="tq-wa-chat__ticks" aria-label="Sent">✓✓</span>
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function TeacherQuestionConversation({
  thread,
  loading,
  error,
  onAnswered,
  onNext,
  onPrevious,
  canGoNext,
  canGoPrevious,
  onTogglePin,
  onBack,
  showBack,
}) {
  const [templateInsert, setTemplateInsert] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const messagesEndRef = useRef(null);

  const studentName = useMemo(
    () => sanitizeQuestionPlainText(thread?.studentName || 'Student'),
    [thread?.studentName]
  );

  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const activeQuestionId = thread?.activeQuestionId ?? null;
  const pinTarget = messages.find((message) => message.isPinned) || messages[messages.length - 1];

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
        <p className="admin-error" role="alert">{error || 'Select a student chat from the list.'}</p>
      </section>
    );
  }

  const statusLine = `${thread.messageCount ?? messages.length} message${messages.length === 1 ? '' : 's'}`;
  let lastDay = '';

  return (
    <section className="tq-ws__center tq-wa-chat" aria-label="Conversation">
      <header className="tq-wa-chat__header">
        {showBack ? (
          <button type="button" className="tq-wa-chat__icon-btn tq-wa-chat__back-btn" onClick={onBack} aria-label="Back to chats">
            ←
          </button>
        ) : (
          <div className="tq-wa-chat__header-nav">
            <button type="button" className="tq-wa-chat__icon-btn" onClick={onPrevious} disabled={!canGoPrevious} aria-label="Previous chat">
              ←
            </button>
            <button type="button" className="tq-wa-chat__icon-btn" onClick={onNext} disabled={!canGoNext} aria-label="Next chat">
              →
            </button>
          </div>
        )}
        <div className="tq-wa-chat__avatar" aria-hidden>
          {studentAvatarLetters(studentName)}
        </div>
        <div className="tq-wa-chat__header-text">
          <h2 className="tq-wa-chat__contact-name">{studentName}</h2>
          <p className="tq-wa-chat__contact-status">{statusLine}</p>
        </div>
        <div className="tq-wa-chat__header-actions">
          {pinTarget ? (
            <button
              type="button"
              className="tq-wa-chat__icon-btn"
              onClick={() => onTogglePin?.(pinTarget.id, !pinTarget.isPinned)}
              aria-label={pinTarget.isPinned ? 'Unpin' : 'Pin'}
              title={pinTarget.isPinned ? 'Unpin' : 'Pin'}
            >
              {pinTarget.isPinned ? '📌' : '☆'}
            </button>
          ) : null}
        </div>
      </header>

      <div className="tq-wa-chat__messages" role="log" aria-live="polite" aria-relevant="additions">
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
              <ThreadMessage message={message} studentName={studentName} />
            </div>
          );
        })}
        <div ref={messagesEndRef} className="tq-wa-chat__scroll-anchor" aria-hidden />
      </div>

      <footer className="tq-wa-chat__footer">
        {activeQuestionId ? (
          <div className="tq-wa-chat__footer-tools">
            <button
              type="button"
              className="tq-wa-chat__templates-toggle"
              onClick={() => setShowTemplates((open) => !open)}
              aria-expanded={showTemplates}
            >
              Quick replies
            </button>
            {showTemplates ? (
              <div className="tq-wa-chat__templates-panel" role="listbox" aria-label="Quick reply templates">
                {TEACHER_REPLY_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    className="tq-wa-chat__template-btn"
                    onClick={() => {
                      setTemplateInsert({ key: Date.now(), text: tpl.text });
                      setShowTemplates(false);
                    }}
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="tq-wa-chat__composer-wrap">
          <TeacherAnswerForm
            questionId={activeQuestionId}
            threadId={thread.threadId}
            onAnswered={onAnswered}
            templateInsert={templateInsert}
            variant="whatsapp"
          />
        </div>
      </footer>
    </section>
  );
}
