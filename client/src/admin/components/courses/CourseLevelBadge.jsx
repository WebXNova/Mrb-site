export default function CourseLevelBadge({ level }) {
  const label = String(level || 'beginner');
  return <span className="course-level-badge">{label}</span>;
}
