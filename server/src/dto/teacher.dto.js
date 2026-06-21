/**
 * Admin-facing teacher DTO — never exposes password_hash or other secrets.
 */
export function toTeacherAdminDto(row, assignedSubjectIds = []) {
  return {
    id: Number(row.id),
    email: row.email,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    isVerified: Boolean(row.is_verified),
    assignedSubjectIds: assignedSubjectIds.map((id) => Number(id)),
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}
