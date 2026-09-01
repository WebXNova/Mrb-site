import CourseStatusBadge from './CourseStatusBadge';
import CourseAdmissionBadge from './CourseAdmissionBadge';
import CourseFinishedBadge, { isCourseFinished } from './CourseFinishedBadge';

/**
 * Three independent course states — visually distinct chips for list + header.
 */
export default function CourseControlBadges({ course, compact = false }) {
  if (!course) return null;
  const finished = isCourseFinished(course);
  return (
    <span className="course-control-badges">
      <CourseStatusBadge active={!!course.is_active} />
      <CourseAdmissionBadge status={course.admission_status} compact={compact} />
      {finished ? <CourseFinishedBadge compact={compact} /> : null}
    </span>
  );
}
