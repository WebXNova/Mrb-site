/** Teacher operational statuses for activation workflow. */
export const TEACHER_ACTIVATION_STATUSES = Object.freeze(['active', 'inactive']);

export function isTeacherOperationalStatus(status) {
  return status === 'active';
}

export function isTeacherActivationStatus(status) {
  return TEACHER_ACTIVATION_STATUSES.includes(status);
}
