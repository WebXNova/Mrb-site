/**
 * Build unique course tabs from dashboard / enrollment payloads.
 * Notes are scoped to an enrolled course, not to lectures — a student
 * can have notes for a course that still has zero published lectures.
 */

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function addTab(rows, seen, idValue, label) {
  const id = positiveId(idValue);
  if (id == null) return;
  const key = String(id);
  if (seen.has(key)) return;
  seen.add(key);
  const title = String(label || '').trim();
  rows.push({
    id: key,
    label: title || `Course ${key}`,
  });
}

/**
 * @param {{
 *   courses?: Array<{ id?: number, courseId?: number, course_id?: number, title?: string, name?: string }>,
 *   course?: { id?: number, courseId?: number, course_id?: number, title?: string, name?: string } | null,
 *   entitlement?: { courseId?: number, course_id?: number, courseTitle?: string } | null,
 *   lectures?: Array<{ courseId?: number, course_id?: number, courseTitle?: string }>,
 *   enrollmentStatus?: {
 *     enrolled?: boolean,
 *     hasActiveAccess?: boolean,
 *     courseId?: number,
 *     course_id?: number,
 *     courseTitle?: string,
 *     courseName?: string,
 *     enrolledCourseName?: string,
 *   } | null,
 * }} source
 * @returns {Array<{ id: string, label: string }>}
 */
export function collectStudentCourseTabs(source = {}) {
  const rows = [];
  const seen = new Set();
  const { courses, course, entitlement, lectures, enrollmentStatus } = source;

  if (Array.isArray(courses)) {
    for (const item of courses) {
      if (!item || typeof item !== 'object') continue;
      addTab(rows, seen, item.id ?? item.courseId ?? item.course_id, item.title ?? item.name);
    }
  }

  if (course && typeof course === 'object') {
    addTab(rows, seen, course.id ?? course.courseId ?? course.course_id, course.title ?? course.name);
  }

  if (entitlement && typeof entitlement === 'object') {
    addTab(
      rows,
      seen,
      entitlement.courseId ?? entitlement.course_id,
      entitlement.courseTitle ?? entitlement.courseName
    );
  }

  if (Array.isArray(lectures)) {
    for (const lecture of lectures) {
      if (!lecture || typeof lecture !== 'object') continue;
      addTab(
        rows,
        seen,
        lecture.courseId ?? lecture.course_id,
        lecture.courseTitle ?? lecture.course_title
      );
    }
  }

  const status = enrollmentStatus && typeof enrollmentStatus === 'object' ? enrollmentStatus : null;
  if (status) {
    const enrolled = status.enrolled === true || status.hasActiveAccess === true;
    if (enrolled) {
      addTab(
        rows,
        seen,
        status.courseId ?? status.course_id,
        status.courseTitle ?? status.courseName ?? status.enrolledCourseName
      );
    }
  }

  rows.sort((a, b) => a.label.localeCompare(b.label));
  return rows;
}
