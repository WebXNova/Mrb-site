/**
 * Settings page validation — score bands ("test range") must not block valid saves.
 * Run: node src/admin/utils/testSettingsPageValidation.test.examples.mjs
 */
import { createEmptyScoreBand } from './testScoreBandValidation.js';
import {
  canonicalizeTestSettingsPageForm,
  defaultTestSettingsPageForm,
  mapApiToTestSettingsPageForm,
  validateTestSettingsPageForm,
} from './testSettingsPageValidation.js';

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

console.log('testSettingsPageValidation — score bands / access\n');

const validForm = {
  ...defaultTestSettingsPageForm,
  title: 'MDCAT Practice Paper',
  access_mode: 'private',
  duration_minutes: '60',
  score_bands: [],
};

{
  const result = validateTestSettingsPageForm(validForm);
  assert(result.ok === true, '14. valid test settings save successfully');
  assert(!Object.prototype.hasOwnProperty.call(result.settingsPayload, 'start_date'), '16. payload omits start_date');
  assert(!Object.prototype.hasOwnProperty.call(result.settingsPayload, 'end_date'), '16. payload omits end_date');
  assert(result.settingsPayload.access_mode === 'private', 'access_mode is persisted');
  assert(result.settingsPayload.display_mode === 'all', 'display_mode is persisted');
  assert(result.settingsPayload.layout_mode === 'vertical', 'layout_mode stays a compatibility mirror');
}

{
  const withPlaceholder = validateTestSettingsPageForm({
    ...validForm,
    score_bands: [createEmptyScoreBand(0)],
  });
  assert(withPlaceholder.ok === true, 'empty score-range row does not block save');
  assert(Array.isArray(withPlaceholder.settingsPayload.score_bands) && withPlaceholder.settingsPayload.score_bands.length === 0, 'placeholder bands are stripped');
}

{
  const emptyHtmlBand = validateTestSettingsPageForm({
    ...validForm,
    score_bands: [{ min_score: '', max_score: '', message_html: '<p></p>&nbsp;' }],
  });
  assert(emptyHtmlBand.ok === true, 'empty HTML score-band row does not block save');
}

{
  const invalidRange = validateTestSettingsPageForm({
    ...validForm,
    score_bands: [
      {
        min_score: '80',
        max_score: '10',
        message_html: 'Pass',
      },
    ],
  });
  assert(invalidRange.ok === false && Boolean(invalidRange.errors.score_bands), '15. invalid score range is rejected');
}

{
  const partial = validateTestSettingsPageForm({
    ...validForm,
    score_bands: [
      {
        min_score: '0',
        max_score: '',
        message_html: '',
      },
    ],
  });
  assert(partial.ok === false, 'incomplete score range is rejected');

  const corrected = validateTestSettingsPageForm({
    ...validForm,
    score_bands: [
      {
        min_score: '0',
        max_score: '100',
        message_html: 'Keep practicing',
      },
    ],
  });
  assert(corrected.ok === true, '17. stale invalid range state clears after valid correction');
}

{
  const publicForm = validateTestSettingsPageForm({ ...validForm, access_mode: 'public' });
  assert(publicForm.ok && publicForm.settingsPayload.access_mode === 'public', '18. public access_mode is saved in payload');
}

{
  const freeStandalone = validateTestSettingsPageForm({
    ...validForm,
    test_access_type: 'free_standalone',
    start_date: '2026-09-01T09:00',
    end_date: '2026-09-02T18:00',
    seat_capacity: '250',
  });
  assert(freeStandalone.ok === true, 'free standalone settings with schedule and seats save');
  assert(Object.prototype.hasOwnProperty.call(freeStandalone.settingsPayload, 'start_date'), 'free standalone payload includes start_date');
  assert(Object.prototype.hasOwnProperty.call(freeStandalone.settingsPayload, 'seat_capacity'), 'free standalone payload includes seat_capacity');
  assert(!Object.prototype.hasOwnProperty.call(freeStandalone.settingsPayload, 'price_pkr'), 'free standalone payload omits price');
}

{
  const paidStandalone = validateTestSettingsPageForm({
    ...validForm,
    test_access_type: 'paid_standalone',
    price_pkr: '1500',
    seat_capacity: '80',
    start_date: '2026-09-01T09:00',
    end_date: '2026-09-02T18:00',
  });
  assert(paidStandalone.ok === true, 'paid standalone settings save');
  assert(paidStandalone.settingsPayload.price_pkr === 1500, 'paid standalone payload includes price');
}

{
  const folded = canonicalizeTestSettingsPageForm({
    ...validForm,
    layout_mode: 'vertical',
    display_mode: 'one_per_page',
  });
  assert(folded.display_mode === 'one_per_page', 'legacy one_per_page draft stays one_per_page');
  assert(!Object.prototype.hasOwnProperty.call(folded, 'layout_mode'), 'canonical form drops layout_mode');
}

{
  const legacyDisplay = validateTestSettingsPageForm({
    ...validForm,
    display_mode: 'vertical',
  });
  assert(legacyDisplay.ok === true, 'legacy vertical display folds and still saves');
  assert(legacyDisplay.settingsPayload.display_mode === 'all', 'legacy vertical becomes all questions');
}

{
  const mapped = mapApiToTestSettingsPageForm({
    settings: {
      title: 'MDCAT Practice Paper',
      layout_mode: 'horizontal',
      display_mode: 'all',
      full_page_mode: true,
      access_mode: 'private',
    },
    rules: { duration_minutes: 60, max_attempts: 1 },
  });
  assert(mapped.display_mode === 'one_per_page', 'API map keeps legacy horizontal as one question per page');
  assert(mapped.full_page_mode === true, 'full_page_mode maps from API');
  const saved = validateTestSettingsPageForm({ ...validForm, ...mapped, title: validForm.title });
  assert(saved.ok && saved.settingsPayload.display_mode === 'one_per_page', 'one-per-page setting is saved');
  assert(saved.settingsPayload.layout_mode === 'horizontal', 'compatibility layout is written in sync');
  assert(saved.ok && saved.settingsPayload.full_page_mode === true, 'fullscreen setting is saved');
}

{
  const paidUnset = validateTestSettingsPageForm({
    ...validForm,
    test_access_type: 'paid_standalone',
    price_pkr: '0',
    seat_capacity: '0',
    shuffle_questions: true,
    shuffle_options: true,
  });
  assert(paidUnset.ok === true, 'paid tests with unset price/seats can still save randomization');
  assert(paidUnset.settingsPayload.shuffle_questions === true, 'shuffle questions is persisted');
  assert(paidUnset.settingsPayload.shuffle_options === true, 'shuffle options is persisted');
  assert(!Object.prototype.hasOwnProperty.call(paidUnset.settingsPayload, 'price_pkr'), 'unset paid price is omitted');
  assert(!Object.prototype.hasOwnProperty.call(paidUnset.settingsPayload, 'seat_capacity'), 'unset paid seats are omitted');
}

{
  const paidInvalid = validateTestSettingsPageForm({
    ...validForm,
    test_access_type: 'paid_standalone',
    price_pkr: '1.5',
    seat_capacity: '2.2',
  });
  assert(paidInvalid.ok === false && Boolean(paidInvalid.errors.price_pkr), 'invalid paid price is still rejected');
  assert(Boolean(paidInvalid.errors.seat_capacity), 'invalid paid seats are still rejected');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
