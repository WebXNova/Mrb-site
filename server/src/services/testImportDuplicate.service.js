/**
 * Duplicate question detection for test import packages.
 */

import { buildMcqImportFingerprint } from './questionImportFingerprint.service.js';

/**
 * @param {Array<Record<string, unknown>>} questions
 */
export function detectDuplicateQuestionsInImport(questions) {
  /** @type {Array<{ questionIndex: number, duplicateOf: number, kind: string, message: string }>} */
  const duplicates = [];

  /** @type {Map<string, number>} */
  const exactIndex = new Map();

  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i];
    const questionText = q.question_html ?? q.question_text ?? '';
    const options = Array.isArray(q.options) ? q.options : [];
    const correctKey =
      q.correct_answer ?? options.find((o) => o.is_correct)?.option_key ?? null;

    const exactFp = buildMcqImportFingerprint({
      questionText,
      options,
      correctAnswerKey: correctKey,
    });

    if (exactIndex.has(exactFp)) {
      duplicates.push({
        questionIndex: i + 1,
        duplicateOf: exactIndex.get(exactFp) + 1,
        kind: 'DUPLICATE_EXACT_IN_FILE',
        message: `Question ${i + 1} is an exact duplicate of question ${exactIndex.get(exactFp) + 1}.`,
      });
    } else {
      exactIndex.set(exactFp, i);
    }
  }

  return duplicates;
}
