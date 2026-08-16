export default function CourseStatusBadge({ active }) {
  const label = active ? 'Active' : 'Inactive';
  return (
    <span
      className={`course-status-badge ${active ? 'course-status-badge--active' : 'course-status-badge--inactive'}`}
      title={label}
    >
      {label}
    </span>
  );
}
