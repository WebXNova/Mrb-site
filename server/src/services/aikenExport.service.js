import { extractVisibleTextFromHtml } from '../utils/semanticHtmlContent.js';

/**
 * @param {import('../dto/question.dto.js').ReturnType<typeof import('../dto/question.dto.js').toQuestionBankDto>} question
 */
export function formatQuestionAsAikenBlock(question) {
  const stem = extractVisibleTextFromHtml(question.question_text);
  const lines = [stem];

  const options = Array.isArray(question.options) ? question.options : [];
  for (const option of options) {
    const key = String(option.option_key || '').trim().toUpperCase();
    if (!key) continue;
    const text = extractVisibleTextFromHtml(option.option_text);
    lines.push(`${key}) ${text}`);
  }

  const correct = options.find((option) => option.is_correct);
  const answerKey = String(correct?.option_key || options[0]?.option_key || 'A')
    .trim()
    .toUpperCase();
  lines.push(`ANSWER: ${answerKey}`);

  const explanation = question.explanation ? extractVisibleTextFromHtml(question.explanation) : '';
  if (explanation) {
    lines.push(`EXPLANATION: ${explanation}`);
  }

  return `${lines.join('\n')}\n`;
}

/**
 * @param {Array<import('../dto/question.dto.js').ReturnType<typeof import('../dto/question.dto.js').toQuestionBankDto>>} questions
 */
export function formatQuestionsAsAikenExport(questions) {
  return questions.map((question) => formatQuestionAsAikenBlock(question)).join('\n');
}
