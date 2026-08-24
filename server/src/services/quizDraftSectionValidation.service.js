import { isQuizDraftSection, filterQuizDraftQuestions } from '../utils/quizDraftItems.js';

/**
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parseSectionSubjectId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * @param {unknown} item
 */
function sectionLabel(item) {
  return String(item?.subjectLabel ?? item?.label ?? '').trim();
}

/**
 * @param {{ id?: number, title?: string }[]} subjects
 * @param {unknown} item
 * @returns {{ id: number, title: string }|null}
 */
export function resolveDraftSectionSubject(item, subjects = []) {
  const list = Array.isArray(subjects) ? subjects : [];
  const subjectId = parseSectionSubjectId(item?.subjectId ?? item?.subject_id);
  if (subjectId) {
    const match = list.find((subject) => Number(subject.id) === subjectId);
    if (match) {
      return { id: Number(match.id), title: String(match.title ?? '').trim() };
    }
  }

  const label = sectionLabel(item).toLowerCase();
  if (!label) return null;
  const match = list.find((subject) => String(subject.title ?? '').trim().toLowerCase() === label);
  return match ? { id: Number(match.id), title: String(match.title ?? '').trim() } : null;
}

/**
 * @param {unknown} draftPayload
 * @param {{ id: number, title?: string }[]} [subjects]
 */
export function collectInvalidSectionLabels(draftPayload, subjects = []) {
  const items = Array.isArray(draftPayload?.questions) ? draftPayload.questions : [];
  /** @type {Array<{ index: number, id: string, sectionNumber: number, label: string }>} */
  const invalid = [];
  let sectionNumber = 0;

  items.forEach((item, index) => {
    if (!isQuizDraftSection(item)) return;
    sectionNumber += 1;
    const label = sectionLabel(item);
    if (subjects.length) {
      if (!resolveDraftSectionSubject(item, subjects)) {
        invalid.push({ index, id: String(item.id ?? ''), sectionNumber, label });
      }
      return;
    }
    if (!label && !parseSectionSubjectId(item?.subjectId ?? item?.subject_id)) {
      invalid.push({ index, id: String(item.id ?? ''), sectionNumber, label });
    }
  });

  return invalid;
}

/**
 * Warn-only: sections with no questions before the next section or end of list.
 * @param {unknown} draftPayload
 */
export function collectEmptySectionWarnings(draftPayload) {
  const items = Array.isArray(draftPayload?.questions) ? draftPayload.questions : [];
  /** @type {string[]} */
  const warnings = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!isQuizDraftSection(item)) continue;

    let hasQuestion = false;
    for (let j = i + 1; j < items.length; j += 1) {
      if (isQuizDraftSection(items[j])) break;
      hasQuestion = true;
      break;
    }

    if (!hasQuestion) {
      const label = sectionLabel(item) || 'Untitled section';
      warnings.push(`Section "${label}" has no questions.`);
    }
  }

  return warnings;
}

/**
 * @param {unknown} draftPayload
 */
export function countDraftQuestionItems(draftPayload) {
  const items = Array.isArray(draftPayload?.questions) ? draftPayload.questions : [];
  return filterQuizDraftQuestions(items).length;
}
