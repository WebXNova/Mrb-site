export default function SaveStatusBadge({ status, error, onRetry }) {
  if (status === 'idle') return null;

  let label = '';
  let className = 'tt-save-status';

  switch (status) {
    case 'saving':
      label = 'Saving…';
      className += ' tt-save-status--saving';
      break;
    case 'saved':
      label = 'Saved';
      className += ' tt-save-status--saved';
      break;
    case 'failed':
      label = error || 'Save failed';
      className += ' tt-save-status--failed';
      break;
    default:
      return null;
  }

  return (
    <div className={className} role="status" aria-live="polite">
      <span>{label}</span>
      {status === 'failed' && onRetry ? (
        <button type="button" className="tt-save-status__retry" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
