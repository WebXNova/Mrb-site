/**
 * @typedef {{ id: number, title: string }} TestSubjectOption
 */

/**
 * @param {unknown} value
 * @returns {number|null}
 */
export function parseSubjectId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * @param {unknown} raw
 * @returns {TestSubjectOption[]}
 */
export function normalizeTestSubjectOptions(raw) {
  if (Array.isArray(raw) && raw.length && raw[0] && typeof raw[0] === 'object') {
    return raw
      .map((item) => ({
        id: parseSubjectId(item.id ?? item.subjectId),
        title: String(item.title ?? item.name ?? '').trim(),
      }))
      .filter((item) => item.id && item.title);
  }
  return [];
}

/**
 * @param {{ subjectId?: number|null, subject_id?: number, subjectLabel?: string, label?: string }} section
 * @param {TestSubjectOption[]} subjects
 * @returns {TestSubjectOption|null}
 */
export function resolveSectionSubject(section, subjects) {
  const list = Array.isArray(subjects) ? subjects : [];
  const subjectId = parseSubjectId(section?.subjectId ?? section?.subject_id);
  if (subjectId) {
    const match = list.find((subject) => subject.id === subjectId);
    if (match) return match;
  }
  const label = String(section?.subjectLabel ?? section?.label ?? '')
    .trim()
    .toLowerCase();
  if (!label) return null;
  return list.find((subject) => String(subject.title).trim().toLowerCase() === label) || null;
}

/**
 * @param {{ subjectId?: number|null, subjectLabel?: string }} section
 * @param {TestSubjectOption[]} subjects
 */
export function isSectionSubjectSelected(section, subjects) {
  return Boolean(resolveSectionSubject(section, subjects));
}
