/**
 * Consistent lifecycle status badge for tests list and detail views.
 */
export function getTestStatusVariant(status) {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (normalized === 'published') return 'published';
  if (normalized === 'ready_for_publish') return 'ready';
  if (normalized === 'draft') return 'draft';
  if (normalized === 'incomplete') return 'incomplete';
  return 'default';
}

export function formatTestStatusLabel(status) {
  const raw = String(status ?? '').trim();
  if (!raw) return 'Unknown';
  if (raw.toLowerCase() === 'published') return 'Published';
  if (raw.toUpperCase() === 'READY_FOR_PUBLISH') return 'Ready for publish';
  if (raw.toUpperCase() === 'INCOMPLETE') return 'Incomplete';
  if (raw.toLowerCase() === 'draft') return 'Draft';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TestStatusBadge({ status }) {
  const variant = getTestStatusVariant(status);
  const label = formatTestStatusLabel(status);

  return <span className={`admin-test-status admin-test-status--${variant}`}>{label}</span>;
}
