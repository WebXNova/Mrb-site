import { MAX_RECORDING_SECONDS } from '../../../utils/qaQuestionValidation';

const WAVEFORM_BARS = [3, 6, 4, 8, 5, 7, 3, 6, 4, 7, 5, 4];

function MicIcon() {
  return (
    <svg className="sqachat-form__mic-icon" viewBox="0 0 24 24" aria-hidden="true">
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

export default function StudentQuestionAudioRecorder({  supported,
  recording,
  countdownLabel,
  previewUrl,
  durationSec,
  hasRecording,
  error,
  disabled,
  onStart,
  onStop,
  onClear,
}) {
  if (!supported) {
    return (
      <p className="sqachat-form__recorder-unsupported" role="status">
        Voice recording is not available in this browser. You can still submit your question as text.
      </p>
    );
  }

  return (
    <div className="sqachat-form__recorder" aria-label="Voice recording">
      <p className="sqachat-form__recorder-hint">
        Record up to {MAX_RECORDING_SECONDS / 60} minutes using your microphone. File uploads are not allowed.
      </p>

      <div className="sqachat-form__recorder-controls">
        {!recording && !hasRecording ? (
          <>
            <button
              type="button"
              className="sqachat-form__record-btn"
              onClick={onStart}
              disabled={disabled}
              aria-label="Start voice recording"
            >
              <MicIcon />
              Record voice
            </button>
            <div className="sqachat-form__waveform-hint" aria-hidden="true">
              {WAVEFORM_BARS.map((height, index) => (
                <span
                  key={index}
                  className="sqachat-form__waveform-bar"
                  style={{ '--bar-h': height }}
                />
              ))}
            </div>
          </>
        ) : null}

        {recording ? (
          <>
            <button
              type="button"
              className="sqachat-form__record-btn sqachat-form__record-btn--stop"
              onClick={onStop}
              disabled={disabled}
              aria-label="Stop voice recording"
            >
              Stop
            </button>
            <div className="sqachat-form__waveform-hint sqachat-form__waveform-hint--active" aria-hidden="true">
              {WAVEFORM_BARS.map((height, index) => (
                <span
                  key={index}
                  className="sqachat-form__waveform-bar"
                  style={{ '--bar-h': height, '--bar-i': index }}
                />
              ))}
            </div>
            <span className="sqachat-form__recorder-timer" role="timer" aria-live="polite" aria-atomic="true">
              <span className="sqachat-form__recorder-dot" aria-hidden />
              Recording · {countdownLabel} left
            </span>
          </>
        ) : null}

        {hasRecording && !recording ? (
          <>
            <button
              type="button"
              className="sqachat-form__record-btn sqachat-form__record-btn--ghost"
              onClick={onClear}
              disabled={disabled}
              aria-label="Delete voice recording"
            >
              Delete recording
            </button>
            <span className="sqachat-form__recorder-meta" role="status">
              Recording saved ({durationSec}s)
            </span>
          </>
        ) : null}
      </div>
      {previewUrl ? (
        <audio className="sqachat-form__recorder-audio" controls src={previewUrl} aria-label="Preview your recording">
          <track kind="captions" />
        </audio>
      ) : null}

      {error ? (
        <p className="premium-field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
