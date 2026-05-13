/**
 * Regression: canonical course API DTO shapes (snake_case, no forbidden fields).
 */
import assert from 'assert';
import {
  normalizeCourseRow,
  toCoursePublicApi,
  toCourseAdminApi,
  deriveShortDescription,
} from '../src/dto/course.dto.js';

const FORBIDDEN = [
  'slug',
  'accent_color',
  'price',
  'original_price',
  'subject',
  'rating',
  'lectures_count',
  'tests_count',
  'students_enrolled',
  'batch_number',
  'instructor',
  'duration_weeks',
];

const PUBLIC_KEYS = [
  'id',
  'title',
  'description',
  'short_description',
  'level',
  'thumbnail_url',
  'created_at',
  'updated_at',
];

const ADMIN_EXTRA = ['is_active', 'created_by'];

function assertNoForbidden(course) {
  for (const k of FORBIDDEN) {
    assert.ok(!Object.prototype.hasOwnProperty.call(course, k), `must not expose ${k}`);
  }
}

function assertKeySet(course, keys) {
  assert.deepStrictEqual(Object.keys(course).sort(), [...keys].sort());
}

function assertIsoString(s, label) {
  assert.strictEqual(typeof s, 'string', `${label} string`);
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(s), `${label} ISO-like`);
}

const rowFromDb = {
  id: 1,
  slug: 'legacy-slug',
  title: 'Sample',
  subject: 'MDCAT',
  description: 'x'.repeat(200),
  short_description: null,
  price: 100,
  original_price: 120,
  accent_color: '#ff0000',
  level: 'Intermediate',
  instructor: 'T',
  batch_number: 'B1',
  image_url: 'https://example.com/x.png',
  duration_weeks: 4,
  is_active: 1,
  created_by: 99,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-02T12:30:00.000Z'),
};

const n = normalizeCourseRow(rowFromDb);
assert.ok(n);

const pub = toCoursePublicApi(n);
assert.ok(pub);
assertKeySet(pub, PUBLIC_KEYS);
assertNoForbidden(pub);
assert.strictEqual(pub.level, 'intermediate');
assert.strictEqual(pub.thumbnail_url, 'https://example.com/x.png');
assert.strictEqual(pub.short_description, deriveShortDescription(rowFromDb.description));
assert.strictEqual(pub.id, 1);
assertIsoString(pub.created_at, 'created_at');
assertIsoString(pub.updated_at, 'updated_at');
assert.strictEqual(pub.is_active, undefined);
assert.strictEqual(pub.created_by, undefined);

const rowWithShort = { ...rowFromDb, short_description: '  Custom summary  ' };
const pub2 = toCoursePublicApi(normalizeCourseRow(rowWithShort));
assert.strictEqual(pub2.short_description, 'Custom summary');

const admin = toCourseAdminApi(n);
assert.ok(admin);
assertKeySet(admin, [...PUBLIC_KEYS, ...ADMIN_EXTRA]);
assertNoForbidden(admin);
assert.strictEqual(admin.is_active, true);
assert.strictEqual(admin.created_by, 99);

console.log('verify-course-dto-shape: OK');
