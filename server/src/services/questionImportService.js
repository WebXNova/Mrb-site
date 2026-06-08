import { parseAiken } from './aikenParser.js';
import { validateAikenQuestions } from './aikenValidator.js';

/**
 * Import questions from Aiken-formatted content into the question bank (Phase 2.1 stub).
 */
export async function importAikenQuestions(content) {
  const parsed = parseAiken(content);
  const { validQuestions, invalidQuestions } = validateAikenQuestions(parsed);

  return {
    initialized: true,
    validQuestions,
    invalidQuestions,
  };
}
