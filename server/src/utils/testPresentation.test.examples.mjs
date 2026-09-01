/**
 * Canonical question display — display_mode is the product source of truth.
 * Run: node src/utils/testPresentation.test.examples.mjs
 */
import {
  buildPresentationSettings,
  canonicalizeDisplayMode,
  canonicalizeLayoutMode,
  displayModeFromLayout,
  isAllQuestionsDisplay,
  isVerticalQuestionFlow,
  layoutModeFromDisplay,
  resolveAuthoritativeDisplay,
  resolveAuthoritativeLayout,
  resolveDisplayModeFromPayload,
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

console.log('testPresentation — display_mode is authoritative\n');

assert(canonicalizeDisplayMode('one_per_page') === 'one_per_page', 'one_per_page is preserved');
assert(canonicalizeDisplayMode('all') === 'all', 'all is preserved');
assert(canonicalizeDisplayMode('vertical') === 'all', 'unknown display falls back to all');
assert(canonicalizeLayoutMode('horizontal') === 'horizontal', 'legacy horizontal layout is preserved');
assert(canonicalizeLayoutMode('other') === 'vertical', 'unknown layout falls back to vertical');

assert(displayModeFromLayout('vertical') === 'all', 'vertical layout maps to all');
assert(displayModeFromLayout('horizontal') === 'one_per_page', 'horizontal layout maps to one_per_page');
assert(layoutModeFromDisplay('all') === 'vertical', 'all maps to compatibility vertical');
assert(layoutModeFromDisplay('one_per_page') === 'horizontal', 'one_per_page maps to compatibility horizontal');

assert(
  resolveAuthoritativeDisplay({ display_mode: 'all', layout_mode: 'vertical' }) === 'all',
  'all + vertical stays all'
);
assert(
  resolveAuthoritativeDisplay({ display_mode: 'one_per_page', layout_mode: 'vertical' }) === 'one_per_page',
  'explicit one_per_page wins over vertical layout'
);
assert(
  resolveAuthoritativeDisplay({ layoutMode: 'horizontal', displayMode: 'all' }) === 'one_per_page',
  'legacy horizontal layout still means one question per page'
);
assert(
  resolveAuthoritativeLayout({ display_mode: 'one_per_page' }) === 'horizontal',
  'layout mirror follows display'
);

assert(isAllQuestionsDisplay('all') === true, 'all is continuous flow');
assert(isAllQuestionsDisplay('one_per_page') === false, 'one_per_page is paginated');
assert(isAllQuestionsDisplay('vertical') === true, 'legacy vertical is continuous');
assert(isAllQuestionsDisplay('horizontal') === false, 'legacy horizontal is paginated');
assert(isVerticalQuestionFlow('all') === true, 'compat helper accepts display values');

assert(
  resolveDisplayModeFromPayload({ display_mode: 'one_per_page' }, { layout_mode: 'vertical' }) === 'one_per_page',
  'payload display_mode is used'
);
assert(
  resolveDisplayModeFromPayload({ layout_mode: 'horizontal' }, { display_mode: 'all' }) === 'one_per_page',
  'legacy payload layout_mode is mapped'
);
assert(
  resolveDisplayModeFromPayload({}, { display_mode: 'all', layout_mode: 'horizontal' }) === 'one_per_page',
  'existing mismatched rows keep one-per-page'
);

{
  const settings = buildPresentationSettings({
    layout_mode: 'horizontal',
    display_mode: 'all',
    full_page_mode: 1,
  });
  assert(settings.displayMode === 'one_per_page', 'buildPresentationSettings keeps legacy one-per-page');
  assert(settings.layoutMode === 'horizontal', 'compatibility layout stays in sync');
  assert(settings.fullPageMode === true, 'full_page_mode is independent of question display');
}

{
  const settings = buildPresentationSettings({
    display_mode: 'all',
    layout_mode: 'vertical',
    full_page_mode: true,
  });
  assert(settings.displayMode === 'all', 'all-questions setting is frozen as all');
  assert(settings.fullPageMode === true, 'fullscreen works with all-questions');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
