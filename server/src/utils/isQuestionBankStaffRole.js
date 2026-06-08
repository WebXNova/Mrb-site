/**
 * Roles permitted to upload Question Bank instructional images.
 */
export function isQuestionBankStaffRole(role) {
  return role === 'admin' || role === 'super_admin' || role === 'teacher';
}
