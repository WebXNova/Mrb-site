export default function FullscreenGate({ open, onEnter, onContinueWithout, error }) {
  if (!open) return null;

  return (
    <div className="tt-fs-gate" role="dialog" aria-modal="true" aria-labelledby="tt-fs-gate-title">
      <div className="tt-fs-gate__card">
        <h2 id="tt-fs-gate-title">Fullscreen mode required</h2>
        <p>This test is designed to be completed in fullscreen mode.</p>
        {error ? <p className="tt-fs-gate__error">{error}</p> : null}
        <div className="tt-fs-gate__actions">
          <button type="button" className="btn btn--primary" onClick={onEnter}>
            Enter fullscreen
          </button>
          {onContinueWithout ? (
            <button type="button" className="btn btn--secondary" onClick={onContinueWithout}>
              Continue without fullscreen
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function FullscreenExitBanner({ open, onEnter }) {
  if (!open) return null;

  return (
    <div className="tt-banner tt-banner--warn tt-banner--fs-exit" role="status">
      <p>You left fullscreen. You can keep answering. Return to fullscreen when you are ready.</p>
      <button type="button" className="tt-banner__dismiss" onClick={onEnter}>
        Return to fullscreen
      </button>
    </div>
  );
}
