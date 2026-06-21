/**
 * Rich HTML content resolution tests.
 * Run: node src/utils/richHtmlContent.test.examples.mjs
 */

import {
  attachRichHtmlMirrorFields,
  normalizeImportQuestionRichFields,
  resolveExplanationHtml,
  resolveOptionHtml,
  resolveQuestionHtml,
} from './richHtmlContent.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

console.log('\n[resolveQuestionHtml]');
assert(resolveQuestionHtml({ question_html: '<p>Rich</p>' }) === '<p>Rich</p>', 'prefers question_html');
assert(resolveQuestionHtml({ question_text: '<p>Legacy</p>' }) === '<p>Legacy</p>', 'falls back to question_text');
assert(resolveQuestionHtml({ question_html: '  <p>x</p>  ' }) === '<p>x</p>', 'trims whitespace');

console.log('\n[resolveExplanationHtml]');
assert(resolveExplanationHtml({ explanation_html: '<p>E</p>' }) === '<p>E</p>', 'prefers explanation_html');
assert(resolveExplanationHtml({ explanation: '<p>Legacy E</p>' }) === '<p>Legacy E</p>', 'falls back to explanation');
assert(resolveExplanationHtml({ explanation: '   ' }) === null, 'empty explanation becomes null');

console.log('\n[resolveOptionHtml]');
assert(resolveOptionHtml({ option_html: '<p>A</p>' }) === '<p>A</p>', 'prefers option_html');
assert(resolveOptionHtml({ option_text: '<p>B</p>' }) === '<p>B</p>', 'falls back to option_text');

console.log('\n[attachRichHtmlMirrorFields]');
const mirrored = attachRichHtmlMirrorFields({
  question_text: '<p><strong>Q</strong></p>',
  explanation: '<p>Because</p>',
  options: [{ option_text: '<p>Opt</p>', option_key: 'A' }],
});
assert(mirrored.question_html === mirrored.question_text, 'mirrors question_html');
assert(mirrored.explanation_html === mirrored.explanation, 'mirrors explanation_html');
assert(mirrored.options[0].option_html === mirrored.options[0].option_text, 'mirrors option_html');

console.log('\n[normalizeImportQuestionRichFields]');
const normalized = normalizeImportQuestionRichFields({
  question_html: '<p>Import Q</p>',
  explanation_html: '<p>Import E</p>',
  options: [{ option_html: '<p>Import A</p>', isCorrect: true, sortOrder: 0 }],
});
assert(normalized.question_text === '<p>Import Q</p>', 'sets question_text from html');
assert(normalized.options[0].option_text === '<p>Import A</p>', 'sets option_text from html');
assert(normalized.options[0].option_key === 'A', 'defaults option_key by index');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
