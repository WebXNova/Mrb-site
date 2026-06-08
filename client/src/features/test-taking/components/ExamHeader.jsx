import SaveStatusBadge from './SaveStatusBadge';

export default function ExamHeader({
  title,
  currentIndex,
  totalQuestions,
  answeredCount,
  timerFormatted,
  isLowTime,
  isCritical,
  isExpired,
  saveStatus,
  saveError,
  onRetrySave,
  onOpenPalette,
  showPaletteToggle,
}) {
  return (
    <header className="tt-header">
      <div className="tt-header__primary">
        <div className="tt-header__info">
          <p className="tt-header__eyebrow">Exam in progress</p>
          <h1 className="tt-header__title">{title}</h1>
          <p className="tt-header__progress">
            Question <strong>{currentIndex + 1}</strong> of <strong>{totalQuestions}</strong>
            <span className="tt-header__divider" aria-hidden="true">
              ·
            </span>
            <span>
              {answeredCount} answered
            </span>
          </p>
        </div>

        <div className="tt-header__actions">
          <SaveStatusBadge status={saveStatus} error={saveError} onRetry={onRetrySave} />

          <div
            className={`tt-timer ${isCritical ? 'tt-timer--critical' : isLowTime ? 'tt-timer--low' : ''} ${isExpired ? 'tt-timer--expired' : ''}`}
            role="timer"
            aria-live="polite"
            aria-label={`Time remaining: ${timerFormatted}`}
          >
            <span className="tt-timer__label">Time left</span>
            <span className="tt-timer__value">{timerFormatted}</span>
          </div>

          {showPaletteToggle ? (
            <button
              type="button"
              className="btn btn--secondary btn--sm tt-header__palette-btn"
              onClick={onOpenPalette}
              aria-haspopup="dialog"
            >
              Questions
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
