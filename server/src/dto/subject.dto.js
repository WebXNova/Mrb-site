/** @param {unknown} v */
function toIsoTimestamp(v) {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  const d = new Date(typeof v === 'string' || typeof v === 'number' ? v : String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** @param {Record<string, unknown>} row */
export function toSubjectAdminDto(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    courseId: Number(row.course_id),
    title: String(row.title ?? ''),
    description: row.description == null ? null : String(row.description),
    orderIndex: Number(row.order_index ?? 0),
    isActive: Boolean(row.is_active),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}
