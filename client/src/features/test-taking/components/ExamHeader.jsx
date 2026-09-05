import SaveStatusBadge from './SaveStatusBadge';

export default function ExamHeader({
  title,
  subject,
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
  onOpenProgress,
  showProgressToggle,
  displayMode = 'all',
  isFullscreen = false,
  onToggleFullscreen,
}) {
  const isScrollAll = displayMode !== 'one_per_page';
  const progressPct =
    totalQuestions > 0
      ? isScrollAll
        ? Math.round((answeredCount / totalQuestions) * 100)
        : Math.round(((currentIndex + 1) / totalQuestions) * 100)
      : 0;

  return (
    <header className="tt-header">
      <div className="tt-header__primary">
        <div className="tt-header__info">
          <p className="tt-header__eyebrow">Exam in progress</p>
          <h1 className="tt-header__title" title={title}>
            {title}
          </h1>
          {subject ? <p className="tt-header__subject">{subject}</p> : null}
          <p className="tt-header__progress">
            {isScrollAll ? (
              <>
                <strong>{answeredCount}</strong>
                {' of '}
                <strong>{totalQuestions}</strong>
                {' answered'}
              </>
            ) : (
              <>
                {'Question '}
                <strong>{currentIndex + 1}</strong>
                {' of '}
                <strong>{totalQuestions}</strong>
                <span className="tt-header__divider" aria-hidden="true">
                  {' · '}
                </span>
                <span>{answeredCount} answered</span>
              </>
            )}
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
            <span className="tt-timer__label">Time remaining</span>
            <span className="tt-timer__value">{timerFormatted}</span>
          </div>

          {onToggleFullscreen ? (
            <button
              type="button"
              className="btn btn--secondary btn--sm tt-header__fs-btn"
              onClick={onToggleFullscreen}
              aria-pressed={isFullscreen}
            >
              {isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            </button>
          ) : null}

          {showProgressToggle && onOpenProgress ? (
            <button
              type="button"
              className="btn btn--secondary btn--sm tt-header__progress-btn"
              onClick={onOpenProgress}
              aria-haspopup="dialog"
            >
              Progress
            </button>
          ) : null}

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

      <div
        className="tt-header__track"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={
          isScrollAll
            ? `Exam progress: ${answeredCount} of ${totalQuestions} answered`
            : `Exam progress: question ${currentIndex + 1} of ${totalQuestions}`
        }
      >
        <div className="tt-header__track-fill" style={{ width: `${progressPct}%` }} />
      </div>
    </header>
  );
}
