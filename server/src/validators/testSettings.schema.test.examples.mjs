/**
 * Course-linked settings must not require start/end dates.
 * Run: node src/validators/testSettings.schema.test.examples.mjs
 */
import { testSettingsBodySchema } from './testSettings.schema.js';

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

console.log('testSettings.schema — course-linked date validation\n');

const base = {
  shuffle_questions: false,
  shuffle_options: false,
  show_explanations: true,
  show_result_immediately: true,
  access_mode: 'private',
};

{
  const parsed = testSettingsBodySchema.safeParse(base);
  assert(parsed.success, '14. valid settings save without start_date/end_date');
}

{
  const parsed = testSettingsBodySchema.safeParse({
    ...base,
    start_date: '2099-01-01T00:00:00.000Z',
    end_date: '2098-01-01T00:00:00.000Z',
  });
  assert(!parsed.success, '15. invalid date range (end before start) is rejected');
}

{
  const parsed = testSettingsBodySchema.safeParse({
    ...base,
    start_date: '2020-01-01T00:00:00.000Z',
  });
  assert(parsed.success, '16. past start_date is not required-invalid for course-linked payloads');
}

{
  const parsed = testSettingsBodySchema.safeParse({
    ...base,
    access_mode: 'public',
  });
  assert(parsed.success && parsed.data.access_mode === 'public', '19. access_mode public is accepted');
}

{
  const parsed = testSettingsBodySchema.safeParse({
    ...base,
    access_mode: 'secret',
  });
  assert(!parsed.success, 'invalid access_mode is rejected');
}

{
  const parsed = testSettingsBodySchema.safeParse({
    ...base,
    display_mode: 'one_per_page',
    full_page_mode: true,
  });
  assert(parsed.success && parsed.data.full_page_mode === true, 'full_page_mode true is accepted');
  assert(parsed.success && parsed.data.display_mode === 'one_per_page', 'display_mode one_per_page is accepted');
}

{
  const parsed = testSettingsBodySchema.safeParse({
    ...base,
    display_mode: 'vertical',
  });
  assert(!parsed.success, 'invalid display_mode is rejected');
}

{
  const parsed = testSettingsBodySchema.safeParse({
    ...base,
    layout_mode: 'horizontal',
  });
  assert(parsed.success && parsed.data.layout_mode === 'horizontal', 'legacy layout_mode is still accepted');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
