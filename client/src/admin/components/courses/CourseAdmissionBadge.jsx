import { isAdmissionOpen, normalizeAdmissionStatus } from '../../../course/courseAdmissionPresentation';

export default function CourseAdmissionBadge({ status, compact = false }) {
  const open = isAdmissionOpen(status);
  const label = open ? 'Admission open' : 'Admission closed';
  return (
    <span
      className={`course-admission-badge ${open ? 'course-admission-badge--open' : 'course-admission-badge--closed'}${
        compact ? ' course-admission-badge--compact' : ''
      }`}
      title={
        open
          ? 'New enrollments allowed; course can appear in the public catalog'
          : 'New enrollments blocked; hidden from the public catalog. Existing students keep access.'
      }
    >
      {compact ? normalizeAdmissionStatus(status) : label}
    </span>
  );
}
