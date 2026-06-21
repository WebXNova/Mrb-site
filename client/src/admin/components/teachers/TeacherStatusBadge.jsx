export function formatTeacherStatusLabel(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'active') return 'Active';
  if (value === 'inactive') return 'Inactive';
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TeacherStatusBadge({ status }) {
  const normalized = String(status || '').trim().toLowerCase();
  const variant = normalized === 'active' ? 'active' : normalized === 'inactive' ? 'inactive' : 'default';
  const label = formatTeacherStatusLabel(status);

  return <span className={`admin-teacher-status admin-teacher-status--${variant}`}>{label}</span>;
}
