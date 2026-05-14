/**
 * Seeds initial curriculum rows for a newly created course inside an open
 * transaction.
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} courseId
 * @param {Array<{ title: string, description: string|null, order_index?: number }>} rows
 */
export async function insertCurriculumSeedsForNewCourse(connection, courseId, rows) {
  const list = Array.isArray(rows) ? [...rows].sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0)) : [];
  let orderIdx = 0;
  for (const item of list) {
    const explicit = Number(item.order_index);
    const idx = Number.isFinite(explicit) ? explicit : orderIdx;
    await connection.query(
      `INSERT INTO subjects (course_id, title, description, order_index, is_active)
       VALUES (?, ?, ?, ?, TRUE)`,
      [courseId, item.title, item.description ?? null, idx]
    );
    orderIdx += 1;
  }
}
