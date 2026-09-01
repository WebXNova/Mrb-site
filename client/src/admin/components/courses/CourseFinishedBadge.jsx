export function isCourseFinished(course) {
  if (!course || typeof course !== 'object') return false;
  if (course.is_finished === true) return true;
  const finishedAt = course.finished_at ?? course.finishedAt;
  return finishedAt != null && String(finishedAt).trim() !== '';
}

export default function CourseFinishedBadge({ compact = false }) {
  return (
    <span
      className={`course-status-badge course-status-badge--finished${compact ? ' course-status-badge--compact' : ''}`}
      title="Course finished — enrolled students no longer have access"
    >
      Finished
    </span>
  );
}
