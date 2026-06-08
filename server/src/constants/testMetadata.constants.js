/**
 * Canonical test metadata enums — single source for API, validation, and DB CHECK alignment.
 */

export const TEST_TYPE_VALUES = Object.freeze(['subject_wise', 'mixed_subject']);

export const TEST_CATEGORY_VALUES = Object.freeze(['MDCAT']);

export const DEFAULT_TEST_CATEGORY = 'MDCAT';

/** Allowed values persisted in tests.status (lifecycle + published). */
export const TEST_DB_STATUS_VALUES = Object.freeze([
  'INCOMPLETE',
  'DRAFT',
  'READY_FOR_PUBLISH',
  'published',
]);

/** Wizard lifecycle labels (computed); published maps to DB status `published`. */
export const TEST_LIFECYCLE_STATUS_VALUES = Object.freeze([
  'INCOMPLETE',
  'DRAFT',
  'READY_FOR_PUBLISH',
  'PUBLISHED',
]);

export const TEST_CATEGORIES = Object.freeze([
  { value: 'MDCAT', label: 'MDCAT', isDefault: true },
]);

export const TEST_TYPE_OPTIONS = Object.freeze([
  { value: 'subject_wise', label: 'Subject-wise (single subject)', description: 'Questions from one subject only' },
  { value: 'mixed_subject', label: 'Mixed subject', description: 'Questions from multiple subjects in the same course' },
]);

export function getTestCreateMetadata() {
  const defaultCategory = TEST_CATEGORIES.find((c) => c.isDefault)?.value ?? DEFAULT_TEST_CATEGORY;
  return {
    categories: TEST_CATEGORIES.map((c) => ({ value: c.value, label: c.label, isDefault: Boolean(c.isDefault) })),
    testTypes: TEST_TYPE_OPTIONS.map((t) => ({
      value: t.value,
      label: t.label,
      description: t.description ?? null,
    })),
    defaultCategory,
    defaultTestType: 'subject_wise',
    testTypeValues: [...TEST_TYPE_VALUES],
    categoryValues: [...TEST_CATEGORY_VALUES],
    dbStatusValues: [...TEST_DB_STATUS_VALUES],
    subjectRules: {
      subject_wise: { field: 'subject_id', min: 1, max: 1 },
      mixed_subject: { field: 'subject_ids', min: 1, max: 50 },
    },
  };
}
