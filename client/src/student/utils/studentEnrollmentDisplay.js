/**
 * Student-facing copy for enrollment / access — never surface raw "Rejected".
 */

function displayStatusOf(row) {
  return String(row?.accessDisplayStatus ?? row?.access_display_status ?? '').toLowerCase();
}

export function isCourseFinishedDisplay(row, finishedByCourseId) {
  if (!row) return false;
  if (displayStatusOf(row) === 'course_finished') return true;
  const mapped = finishedByCourseId?.get(Number(row.courseId ?? row.course_id));
  if (String(mapped || '').toLowerCase() === 'course_finished') return true;
  if (row.is_finished === true) return true;
  const finishedAt = row.finished_at ?? row.finishedAt ?? row.courseFinishedAt;
  return finishedAt != null && String(finishedAt).trim() !== '';
}

export function studentAccessLabel(row, finishedByCourseId) {
  if (isCourseFinishedDisplay(row, finishedByCourseId)) {
    return 'This course has ended';
  }
  const apiLabel = row?.accessDisplayLabel ?? row?.access_display_label;
  if (apiLabel) return apiLabel;
  const access = String(row?.accessStatus || row?.access_status || '').toLowerCase();
  if (access === 'active') return 'Active access';
  if (access === 'revoked') return 'Access ended';
  if (access === 'inactive') return 'Inactive';
  return access ? `${access.charAt(0).toUpperCase()}${access.slice(1)} access` : '—';
}

export function studentEnrollmentStatusLabel(row, finishedByCourseId) {
  if (isCourseFinishedDisplay(row, finishedByCourseId)) {
    return 'Course Finished';
  }
  const status = String(row?.status || '').toLowerCase();
  if (status === 'rejected') return 'Access ended';
  if (!status) return '—';
  return status.charAt(0).toUpperCase() + status.slice(1);
}
