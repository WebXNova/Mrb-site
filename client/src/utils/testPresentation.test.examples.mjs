/**
 * Canonical question display — client copy.
 * Run: node src/utils/testPresentation.test.examples.mjs
 */
import {
  buildPresentationSettings,
  isAllQuestionsDisplay,
  resolveAuthoritativeDisplay,
  resolveAuthoritativeLayout,
} from './testPresentation.js';

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

console.log('client testPresentation\n');

assert(resolveAuthoritativeDisplay({ display_mode: 'all' }) === 'all', 'all is canonical');
assert(
  resolveAuthoritativeDisplay({ layout_mode: 'vertical', display_mode: 'one_per_page' }) === 'one_per_page',
  'legacy drafts keep one_per_page'
);
assert(
  resolveAuthoritativeLayout({ display_mode: 'one_per_page' }) === 'horizontal',
  'layout mirror follows display'
);
assert(isAllQuestionsDisplay('all') === true, 'all-questions flow');
assert(isAllQuestionsDisplay('one_per_page') === false, 'one-per-page flow');
assert(buildPresentationSettings({ fullPageMode: true }).fullPageMode === true, 'fullscreen flag is read');
assert(buildPresentationSettings({ fullPageMode: true, display_mode: 'one_per_page' }).displayMode === 'one_per_page', 'fullscreen does not change display mode');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
