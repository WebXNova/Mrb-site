/**
 * Display-layer labels for enrollment access. Does not change stored ENUMs.
 * Revokes from "Mark Course Finished" map to Course Finished instead of Rejected.
 */

export const ACCESS_DISPLAY_STATUS = Object.freeze({
  ACTIVE: 'active',
  COURSE_FINISHED: 'course_finished',
  REVOKED: 'revoked',
  INACTIVE: 'inactive',
  NONE: 'none',
});

export function isCourseFinishedFlag(finishedAt) {
  return finishedAt != null && String(finishedAt).trim() !== '';
}

/**
 * @param {{ accessStatus?: unknown, enrollmentStatus?: unknown, courseFinishedAt?: unknown }} input
 */
export function mapEnrollmentAccessDisplay(input = {}) {
  const access = String(input.accessStatus || '').toLowerCase();
  const enrollmentStatus = String(input.enrollmentStatus || '').toLowerCase();
  const finished = isCourseFinishedFlag(input.courseFinishedAt);

  if (finished && (access === 'revoked' || enrollmentStatus === 'rejected')) {
    return {
      accessDisplayStatus: ACCESS_DISPLAY_STATUS.COURSE_FINISHED,
      accessDisplayLabel: 'Course Finished',
    };
  }

  if (access === 'active') {
    return {
      accessDisplayStatus: ACCESS_DISPLAY_STATUS.ACTIVE,
      accessDisplayLabel: 'Active',
    };
  }

  if (access === 'revoked') {
    return {
      accessDisplayStatus: ACCESS_DISPLAY_STATUS.REVOKED,
      accessDisplayLabel: 'Access ended',
    };
  }

  if (access === 'inactive' || access) {
    return {
      accessDisplayStatus: ACCESS_DISPLAY_STATUS.INACTIVE,
      accessDisplayLabel: enrollmentStatus === 'rejected' ? 'Access ended' : 'Inactive',
    };
  }

  return {
    accessDisplayStatus: ACCESS_DISPLAY_STATUS.NONE,
    accessDisplayLabel: null,
  };
}
