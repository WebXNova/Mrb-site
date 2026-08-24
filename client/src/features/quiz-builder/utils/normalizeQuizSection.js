import { QUIZ_DRAFT_ITEM_TYPE } from './quizDraftItems.js';

/**
 * Canonical section fields match the server quiz-draft schema:
 * subjectLabel, collapsed, showDividerContent, dividerContentHtml.
 *
 * Older local drafts used subjectLabel / showDividerContent / dividerContentHtml.
 *
 * @param {unknown} item
 * @returns {import('../types/quizBuilder.types.js').QuizSection | null}
 */
export function normalizeQuizSection(item) {
  if (!item || typeof item !== 'object') return null;
  const row = /** @type {Record<string, unknown>} */ (item);
  if (row.itemType !== QUIZ_DRAFT_ITEM_TYPE.SECTION) return null;
  if (typeof row.id !== 'string' || !row.id.trim()) return null;

  const subjectLabel = String(row.subjectLabel ?? row.label ?? '');
  const rawSubjectId = row.subjectId ?? row.subject_id;
  const parsedId = Number(rawSubjectId);
  const subjectId = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;
  const showDividerContent = Boolean(row.showDividerContent ?? row.showDividerContent);
  const dividerContentHtml = String(
    row.dividerContentHtml ?? row.dividerContentHtml ?? row.dividerHtml ?? ''
  );

  return {
    id: row.id,
    itemType: 'section',
    subjectId,
    subjectLabel,
    collapsed: Boolean(row.collapsed),
    showDividerContent,
    dividerContentHtml,
  };
}

/**
 * @param {unknown} item
 */
export function isNormalizedQuizSection(item) {
  return Boolean(normalizeQuizSection(item));
}
