/**
 * Synthetic test export documents for scale and preservation testing.
 */

import { buildTestExportJsonDocument } from '../../src/utils/testExportJson.serializer.js';

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

/**
 * @param {number} count
 * @param {{
 *   richHtml?: boolean,
 *   withImages?: boolean,
 *   imageUrl?: string,
 * }} [opts]
 */
export function buildScaleTestDocument(count, opts = {}) {
  const richHtml = opts.richHtml !== false;
  const withImages = Boolean(opts.withImages);
  const imageUrl =
    opts.imageUrl ??
    '/api/uploads/question-bank/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp';

  const questions = [];
  for (let i = 0; i < count; i += 1) {
    const correctKey = OPTION_KEYS[i % 4];
    const stem = richHtml
      ? `<p><strong>Question ${i + 1}</strong> with <em>rich</em> formatting</p>
<ul><li>Item A</li><li>Item B</li></ul>
<table><tr><td>Cell</td><td>Value</td></tr></table>
<p>Equation: x<sup>2</sup> + y<sub>2</sub> = z</p>
${withImages ? `<img src="${imageUrl}" alt="fig-${i}">` : ''}`
      : `Plain question ${i + 1}`;

    const explanation = richHtml
      ? `<p>Because <strong>reason ${i + 1}</strong> applies.</p>`
      : null;

    questions.push({
      display_order: i,
      marks_override: null,
      topic: `Topic ${(i % 10) + 1}`,
      difficulty: ['easy', 'medium', 'hard'][i % 3],
      question_type: 'mcq',
      question_html: stem,
      question_text: stem,
      question_image_url: withImages ? imageUrl : null,
      explanation_html: explanation,
      explanation,
      marks: 1,
      correct_answer: correctKey,
      options: OPTION_KEYS.map((key, oi) => ({
        option_key: key,
        option_html: richHtml ? `<p><strong>${key}</strong> option for Q${i + 1}</p>` : `${key}`,
        option_text: richHtml ? `<p><strong>${key}</strong> option for Q${i + 1}</p>` : `${key}`,
        image_url: withImages && oi === 0 ? imageUrl : null,
        is_correct: key === correctKey,
        sort_order: oi,
      })),
    });
  }

  return buildTestExportJsonDocument({
    test_id: 999,
    course_id: 1,
    subject_ids: [1],
    test: {
      title: `Scale Test (${count} questions)`,
      description: 'Synthetic scale fixture',
      category: 'MDCAT',
      test_type: 'mixed_subject',
      duration_minutes: Math.max(30, Math.ceil(count / 2)),
      passing_marks: Math.ceil(count * 0.4),
      max_attempts: 1,
      negative_marking: 0,
      shuffle_questions: false,
      shuffle_options: false,
      show_explanations: true,
      show_result_immediately: true,
      show_answers_after_submit: false,
      allow_retake: false,
      access_mode: 'private',
      tags: ['scale-test'],
    },
    questions,
  });
}

/** HTML markers used in preservation assertions. */
export const PRESERVATION_MARKERS = Object.freeze({
  bold: '<strong>',
  list: '<li>',
  table: '<table>',
  superscript: '<sup>',
  subscript: '<sub>',
  explanation: '<strong>reason',
});
