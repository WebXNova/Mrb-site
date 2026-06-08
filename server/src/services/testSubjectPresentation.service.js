/**
 * Test subject labels — sole presentation source via test_subjects → subjects.
 * Never read tests.subject VARCHAR.
 */

import { mysqlPool } from '../config/mysql.js';

/**
 * @param {string[]} titles
 */
export function formatTestSubjectDisplayLabel(titles) {
  const clean = titles.map((t) => String(t || '').trim()).filter(Boolean);
  return clean.length ? clean.join(', ') : null;
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function loadTestSubjectPresentation(testId, executor = mysqlPool) {
  const tid = Number(testId);
  const [rows] = await executor.query(
    `SELECT s.id AS subject_id, s.title
     FROM test_subjects ts
     INNER JOIN subjects s ON s.id = ts.subject_id
     WHERE ts.test_id = ?
     ORDER BY s.order_index ASC, s.id ASC`,
    [tid]
  );

  const subjectIds = rows.map((row) => Number(row.subject_id));
  const subjectTitles = rows.map((row) => String(row.title || '').trim()).filter(Boolean);

  return {
    subjectIds,
    subjectTitles,
    displayLabel: formatTestSubjectDisplayLabel(subjectTitles),
  };
}

/**
 * @param {number[]} testIds
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 * @returns {Promise<Map<number, { subjectIds: number[], subjectTitles: string[], displayLabel: string|null }>>}
 */
export async function loadTestSubjectPresentationBatch(testIds, executor = mysqlPool) {
  const ids = [...new Set(testIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  const map = new Map();
  if (!ids.length) return map;

  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await executor.query(
    `SELECT ts.test_id, s.id AS subject_id, s.title
     FROM test_subjects ts
     INNER JOIN subjects s ON s.id = ts.subject_id
     WHERE ts.test_id IN (${placeholders})
     ORDER BY ts.test_id ASC, s.order_index ASC, s.id ASC`,
    ids
  );

  for (const row of rows) {
    const tid = Number(row.test_id);
    if (!map.has(tid)) {
      map.set(tid, { subjectIds: [], subjectTitles: [], displayLabel: null });
    }
    const entry = map.get(tid);
    entry.subjectIds.push(Number(row.subject_id));
    const title = String(row.title || '').trim();
    if (title) entry.subjectTitles.push(title);
  }

  for (const entry of map.values()) {
    entry.displayLabel = formatTestSubjectDisplayLabel(entry.subjectTitles);
  }

  return map;
}
