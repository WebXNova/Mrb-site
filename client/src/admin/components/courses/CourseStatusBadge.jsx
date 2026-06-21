export default function CourseStatusBadge({ active }) {
  return (
    <span className={`course-status-badge ${active ? 'course-status-badge--active' : 'course-status-badge--inactive'}`}>
      <span aria-hidden>{active ? '●' : '○'}</span>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}
