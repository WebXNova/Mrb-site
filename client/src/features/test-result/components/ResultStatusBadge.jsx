export default function ResultStatusBadge({ status }) {
  const normalized = String(status || '').toUpperCase();
  const isPass = normalized === 'PASS';
  const isFail = normalized === 'FAIL';

  let className = 'tr-status-badge';
  let label = normalized || '—';

  if (isPass) {
    className += ' tr-status-badge--pass';
    label = 'PASS';
  } else if (isFail) {
    className += ' tr-status-badge--fail';
    label = 'FAIL';
  } else {
    className += ' tr-status-badge--neutral';
  }

  return (
    <p className={className} role="status" aria-label={`Result status: ${label}`}>
      {label}
    </p>
  );
}
