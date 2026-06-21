import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_QUESTION_BODY_LENGTH,
  MAX_RECORDING_SECONDS,
  MIN_WORDS_TEXT_ONLY,
  MIN_WORDS_WITH_MEDIA,
} from '../../../utils/qaQuestionValidation';
import { useIsStudentMobileNav } from '../../hooks/useMediaQuery';

const WAVEFORM_BARS = [3, 6, 4, 8, 5, 7, 3, 6, 4, 7, 5, 4];
const HINTS_ID = 'qa-composer-hints';

function AttachIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
        fill="currentColor"
      />
      <path
        d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.08A7 7 0 0 0 19 11Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M18 6 6 18M6 6l12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Waveform({ active = false }) {
  return (
    <div
      className={`sqachat-wa-composer__waveform${active ? ' sqachat-wa-composer__waveform--active' : ''}`}
      aria-hidden="true"
    >
      {WAVEFORM_BARS.map((height, index) => (
        <span
          key={index}
          className="sqachat-wa-composer__waveform-bar"
          style={{ '--bar-h': height, '--bar-i': index }}
        />
      ))}
    </div>
  );
}

export default function StudentQuestionComposer({
  question,
  onQuestionChange,
  words,
  hasMedia,
  charCounter,
  charCounterWarn,
  questionHint,
  fieldErrors,
  file,
  previewUrl,
  onPickFile,
  onClearFile,
  audio,
  canSubmit,
  submitting,
}) {
  const isMobile = useIsStudentMobileNav();
  const textareaRef = useRef(null);
  const [focused, setFocused] = useState(false);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, isMobile ? 120 : 160)}px`;
  }, [isMobile]);

  useEffect(() => {
    resizeTextarea();
  }, [question, resizeTextarea, audio.recording, isMobile]);

  const hasText = question.trim().length > 0;
  const hasAttachment = Boolean(file) || audio.hasRecording;
  const showMic =
    audio.supported &&
    !audio.recording &&
    !audio.hasRecording &&
    !submitting;
  const showSend = !audio.recording && (hasText || hasAttachment || !showMic);

  const showStatusRow =
    hasText ||
    hasAttachment ||
    focused ||
    Boolean(fieldErrors.question) ||
    charCounterWarn;

  const imageHint = 'Image attachment (optional). JPEG, PNG, or WebP · max 5 MB';
  const voiceHint = `Voice recording (optional). Record up to ${MAX_RECORDING_SECONDS / 60} minutes using your microphone. File uploads are not allowed. Record in the browser — file uploads are not accepted.`;

  function handleCancelRecording() {
    if (audio.recording) {
      audio.cancelRecording();
      return;
    }
    audio.clearRecording();
  }

  return (
    <div className="sqachat-wa-composer">
      <div id={HINTS_ID} className="sqachat-wa-composer__hints-a11y">
        {questionHint} {imageHint} {voiceHint}
        {!audio.supported
          ? ' Voice recording is not available in this browser. You can still submit your question as text.'
          : ''}
      </div>

      {(previewUrl || audio.hasRecording) && !audio.recording ? (
        <div className="sqachat-wa-composer__previews">
          {previewUrl ? (
            <div className="sqachat-wa-composer__preview sqachat-wa-composer__preview--image">
              <img src={previewUrl} alt="Preview of selected image" />
              <button
                type="button"
                className="sqachat-wa-composer__preview-remove"
                onClick={onClearFile}
                disabled={submitting}
                aria-label="Remove image"
              >
                <CloseIcon />
              </button>
            </div>
          ) : null}

          {audio.hasRecording && !audio.recording ? (
            <div className="sqachat-wa-composer__preview sqachat-wa-composer__preview--voice">
              <span className="sqachat-wa-composer__voice-chip">
                <MicIcon />
                {audio.durationSec}s
              </span>
              {audio.previewUrl ? (
                <audio
                  className="sqachat-wa-composer__voice-audio"
                  controls
                  src={audio.previewUrl}
                  aria-label="Preview your recording"
                >
                  <track kind="captions" />
                </audio>
              ) : null}
              <button
                type="button"
                className="sqachat-wa-composer__preview-remove sqachat-wa-composer__preview-remove--voice"
                onClick={audio.clearRecording}
                disabled={submitting}
                aria-label="Delete voice recording"
              >
                <CloseIcon />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {audio.recording ? (
        <div className="sqachat-wa-composer__bar sqachat-wa-composer__bar--recording" aria-label="Voice recording">
          <button
            type="button"
            className="sqachat-wa-composer__icon-btn sqachat-wa-composer__icon-btn--cancel"
            onClick={handleCancelRecording}
            disabled={submitting}
            aria-label="Cancel voice recording"
          >
            <CloseIcon />
          </button>
          <div className="sqachat-wa-composer__recording-body">
            <Waveform active />
            <span className="sqachat-wa-composer__recording-timer" role="timer" aria-live="polite">
              <span className="sqachat-form__recorder-dot" aria-hidden />
              {audio.countdownLabel}
            </span>
          </div>
          <button
            type="button"
            className="sqachat-wa-composer__icon-btn sqachat-wa-composer__icon-btn--stop"
            onClick={audio.stopRecording}
            disabled={submitting}
            aria-label="Stop voice recording"
          />
        </div>
      ) : (
        <div className="sqachat-wa-composer__bar">
          <div className="sqachat-wa-composer__attach">
            <input
              id="qa-image"
              className="sqachat-form__file-input-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onPickFile}
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.image)}
            />
            <label
              htmlFor="qa-image"
              className="sqachat-wa-composer__icon-btn sqachat-wa-composer__icon-btn--attach"
              aria-label={imageHint}
              title={imageHint}
            >
              <AttachIcon />
            </label>
          </div>

          <textarea
            ref={textareaRef}
            id="qa-body"
            className="sqachat-wa-composer__input"
            placeholder={
              isMobile
                ? 'Describe your doubt…'
                : 'Describe your doubt clearly so a teacher can help you.'
            }
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={submitting}
            maxLength={MAX_QUESTION_BODY_LENGTH}
            rows={1}
            aria-invalid={Boolean(fieldErrors.question)}
            aria-describedby={HINTS_ID}
          />

          {showMic || showSend ? (
            <div className="sqachat-wa-composer__actions">
              {showMic ? (
                <button
                  type="button"
                  className="sqachat-wa-composer__icon-btn sqachat-wa-composer__icon-btn--mic"
                  onClick={audio.startRecording}
                  disabled={submitting}
                  aria-label={voiceHint}
                  title="Record voice"
                >
                  <MicIcon />
                </button>
              ) : null}

              {showSend ? (
                <button
                  type="submit"
                  className="sqachat-wa-composer__icon-btn sqachat-wa-composer__icon-btn--send"
                  disabled={!canSubmit}
                  aria-busy={submitting}
                  aria-label={submitting ? 'Sending question' : 'Submit question'}
                  title="Submit question"
                >
                  <SendIcon />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {showStatusRow ? (
        <div className="sqachat-wa-composer__status" aria-live="polite">
          {hasText || hasAttachment ? (
            <span className="sqachat-wa-composer__wordcount">
              {words} word{words === 1 ? '' : 's'}
              {hasMedia
                ? ` · min ${MIN_WORDS_WITH_MEDIA}`
                : ` · min ${MIN_WORDS_TEXT_ONLY}`}
            </span>
          ) : (
            <span className="sqachat-wa-composer__status-hint">{questionHint}</span>
          )}
          <span
            className={`sqachat-wa-composer__char-counter${charCounterWarn ? ' sqachat-wa-composer__char-counter--warn' : ''}`}
          >
            {charCounter}
          </span>
        </div>
      ) : null}

      <p className="sqachat-wa-composer__hints-desktop" aria-hidden="true">
        {questionHint} · {imageHint} · {voiceHint}
      </p>

      {fieldErrors.question ? (
        <p className="premium-field__error" role="alert">
          {fieldErrors.question}
        </p>
      ) : null}
      {fieldErrors.image ? (
        <p className="premium-field__error" role="alert">
          {fieldErrors.image}
        </p>
      ) : null}
      {fieldErrors.audio || audio.error ? (
        <p className="premium-field__error" role="alert">
          {fieldErrors.audio || audio.error}
        </p>
      ) : null}
    </div>
  );
}
