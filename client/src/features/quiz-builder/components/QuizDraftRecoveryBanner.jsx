/**
 * A4 — Recovery status banner for quiz builder hydration fallbacks.
 *
 * @param {{
 *   recovery?: {
 *     message?: string|null,
 *     source?: string,
 *     fallbackReason?: string,
 *     needsSync?: boolean,
 *   }|null,
 *   hydrationError?: string,
 *   hydrationState?: 'pending' | 'ready' | 'error',
 *   onRetry?: () => void,
 * }} props
 */
export default function QuizDraftRecoveryBanner({
  recovery = null,
  hydrationError = '',
  hydrationState = 'ready',
  onRetry,
}) {
  if (hydrationState === 'pending') {
    return (
      <div className="qb-recovery-banner qb-recovery-banner--loading" role="status" aria-live="polite">
        Loading draft from server…
      </div>
    );
  }

  if (hydrationState === 'error' && hydrationError) {
    return (
      <div className="qb-recovery-banner qb-recovery-banner--error" role="alert">
        <span>{hydrationError}</span>
        {onRetry ? (
          <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (!recovery?.message) return null;

  const isWarning =
    recovery.fallbackReason === 'network' ||
    recovery.fallbackReason === 'session' ||
    recovery.source === 'local_unsynced';

  return (
    <div
      className={`qb-recovery-banner${isWarning ? ' qb-recovery-banner--warning' : ' qb-recovery-banner--info'}`}
      role="status"
      aria-live="polite"
    >
      <span>{recovery.message}</span>
      {recovery.needsSync ? (
        <span className="qb-recovery-banner__hint">Changes will sync automatically when possible.</span>
      ) : null}
    </div>
  );
}
