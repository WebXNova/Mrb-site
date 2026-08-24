/**
 * Build ordered exam timeline: section dividers inserted when section_id changes.
 * Tests with no sections (all sectionId null) produce question-only items — unchanged flow.
 *
 * @param {Array<{ id: string, sectionId?: string|number|null }>} questions
 * @param {Array<{ id: number, subjectLabel?: string, dividerContentHtml?: string|null }>} sections
 */
export function buildExamItems(questions, sections = []) {
  if (!Array.isArray(questions) || !questions.length) return [];

  const sectionById = new Map();
  for (const section of sections) {
    if (section?.id != null) {
      sectionById.set(String(section.id), section);
    }
  }

  /** @type {Array<{ type: 'section', key: string, section: object } | { type: 'question', key: string, question: object, questionNumber: number }>} */
  const items = [];
  let lastSectionId = null;
  let questionNumber = 0;

  for (const question of questions) {
    const sectionId = question.sectionId == null ? null : String(question.sectionId);

    // Insert divider when entering a new non-null section (skip duplicate markers).
    if (sectionId != null && sectionId !== lastSectionId) {
      const section = sectionById.get(sectionId);
      if (section) {
        items.push({
          type: 'section',
          key: `section-${sectionId}`,
          section,
        });
      }
    }

    lastSectionId = sectionId;
    questionNumber += 1;
    items.push({
      type: 'question',
      key: `question-${question.id}`,
      question,
      questionNumber,
    });
  }

  return items;
}

/**
 * @param {ReturnType<typeof buildExamItems>} examItems
 * @param {number} questionIndex — 0-based index among question items only
 */
export function questionIndexToItemIndex(examItems, questionIndex) {
  let qCount = 0;
  for (let i = 0; i < examItems.length; i += 1) {
    if (examItems[i].type === 'question') {
      if (qCount === questionIndex) return i;
      qCount += 1;
    }
  }
  return Math.max(0, Math.min(examItems.length - 1, questionIndex));
}

/**
 * @param {ReturnType<typeof buildExamItems>} examItems
 * @param {number} itemIndex
 */
export function itemIndexToQuestionIndex(examItems, itemIndex) {
  let qCount = 0;
  for (let i = 0; i <= itemIndex && i < examItems.length; i += 1) {
    if (examItems[i].type === 'question') {
      if (i === itemIndex) return qCount;
      qCount += 1;
    }
  }
  return Math.max(0, qCount - 1);
}
