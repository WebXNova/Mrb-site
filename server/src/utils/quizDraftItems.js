export const QUIZ_DRAFT_ITEM_TYPE = Object.freeze({
  QUESTION: 'question',
  SECTION: 'section',
});

/**
 * @param {unknown} item
 */
export function isQuizDraftSection(item) {
  return Boolean(item && typeof item === 'object' && /** @type {{ itemType?: string }} */ (item).itemType === QUIZ_DRAFT_ITEM_TYPE.SECTION);
}

/**
 * @param {unknown} item
 */
export function isQuizDraftQuestion(item) {
  return !isQuizDraftSection(item);
}

/**
 * @param {unknown[] | null | undefined} items
 */
export function filterQuizDraftQuestions(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(isQuizDraftQuestion);
}

/**
 * @param {unknown[] | null | undefined} items
 */
export function filterQuizDraftSections(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(isQuizDraftSection);
}

/**
 * Walk list order: each question inherits section_id from the most recent section marker.
 * @param {unknown[]} items
 * @returns {Array<{ item: unknown, questionIndex?: number, sectionIndex?: number, activeSectionId: string|null }>}
 */
export function walkQuizDraftItems(items) {
  if (!Array.isArray(items)) return [];

  /** @type {string|null} */
  let activeSectionId = null;
  let questionIndex = 0;
  let sectionIndex = 0;

  return items.map((item) => {
    if (isQuizDraftSection(item)) {
      const sectionId = String(/** @type {{ id?: string }} */ (item).id ?? '');
      activeSectionId = sectionId || null;
      const row = {
        item,
        sectionIndex,
        activeSectionId,
      };
      sectionIndex += 1;
      return row;
    }

    const row = {
      item,
      questionIndex,
      activeSectionId,
    };
    questionIndex += 1;
    return row;
  });
}
