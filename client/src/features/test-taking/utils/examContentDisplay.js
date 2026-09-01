const STEM_LABEL = '(?:QUESTION|ANSWER|EXPLANATION)';

/**
 * Strip leading import/storage prefixes from exam display HTML.
 * Does not mutate stored question data. Always sanitize after this.
 *
 * @param {unknown} html
 * @returns {string}
 */
export function stripExamContentLabels(html) {
  const source = String(html ?? '');
  if (!source) return '';

  const leadingLabel = new RegExp(
    `^(\\s*(?:<(?:p|div|span|h[1-6])\\b[^>]*>\\s*)*)(?:<(?:strong|b|em|span)\\b[^>]*>\\s*)?${STEM_LABEL}\\s*:\\s*(?:&nbsp;|\\u00a0)?\\s*(?:</(?:strong|b|em|span)>)?\\s*`,
    'i'
  );

  return source.replace(leadingLabel, '$1');
}

/**
 * @param {{ currentIndex?: number, totalQuestions?: number, answeredCount?: number, displayMode?: string, layoutMode?: string }} input
 */
export function formatExamProgressCopy({
  currentIndex = 0,
  totalQuestions = 0,
  answeredCount = 0,
  displayMode,
  layoutMode = 'vertical',
} = {}) {
  const isPaginated = displayMode === 'one_per_page' || (!displayMode && layoutMode === 'horizontal');
  if (isPaginated) {
    return `Question ${currentIndex + 1} of ${totalQuestions} · ${answeredCount} answered`;
  }
  return `${answeredCount} of ${totalQuestions} answered`;
}
