/**
 * Regression: canonical course API DTO shapes (snake_case, no forbidden fields).
 *
 * The public/admin response shapes include a nested `pricing` object sourced
 * from joined `cp_*` columns. Top-level legacy keys (slug, price, subject, ...)
 * must never appear on the response.
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
  'pricing',
  'start_date',
  'end_date',
  'admission_status',
  'is_enrollment_open',
  'enrollment_message',
  'created_at',
  'updated_at',
];

const ADMIN_EXTRA = ['is_active', 'created_by'];

const PRICING_KEYS = ['type', 'currency', 'price_amount', 'original_price_amount'];

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

// Row with a joined effective pricing row and many legacy fields that must stay invisible.
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
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  admission_status: 'OPEN',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-02T12:30:00.000Z'),
  cp_id: 42,
  cp_price_amount: 2500,
  cp_original_price_amount: 5000,
  cp_currency_code: 'PKR',
  cp_pricing_type: 'one_time',
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

// Nested pricing must exist with the exact contract shape and no extras.
assert.ok(pub.pricing, 'pricing object must be present');
assert.deepStrictEqual(Object.keys(pub.pricing).sort(), [...PRICING_KEYS].sort());
assert.strictEqual(pub.pricing.type, 'one_time');
assert.strictEqual(pub.pricing.currency, 'PKR');
assert.strictEqual(pub.pricing.price_amount, 2500);
assert.strictEqual(pub.pricing.original_price_amount, 5000);

// Row without joined pricing → pricing should be `null` (explicit, not omitted).
const rowNoPricing = { ...rowFromDb, cp_id: null, cp_price_amount: null, cp_original_price_amount: null,
  cp_currency_code: null, cp_pricing_type: null };
const pubNoPricing = toCoursePublicApi(normalizeCourseRow(rowNoPricing));
assert.strictEqual(pubNoPricing.pricing, null);

// Free pricing: amount 0, original ignored even if joined as a stale higher value.
const rowFree = { ...rowFromDb, cp_price_amount: 0, cp_original_price_amount: 0, cp_pricing_type: 'free' };
const pubFree = toCoursePublicApi(normalizeCourseRow(rowFree));
assert.strictEqual(pubFree.pricing.type, 'free');
assert.strictEqual(pubFree.pricing.price_amount, 0);
assert.strictEqual(pubFree.pricing.original_price_amount, null);

const rowWithShort = { ...rowFromDb, short_description: '  Custom summary  ' };
const pub2 = toCoursePublicApi(normalizeCourseRow(rowWithShort));
assert.strictEqual(pub2.short_description, 'Custom summary');

const admin = toCourseAdminApi(n);
assert.ok(admin);
assertKeySet(admin, [...PUBLIC_KEYS, ...ADMIN_EXTRA]);
assertNoForbidden(admin);
assert.strictEqual(admin.is_active, true);
assert.strictEqual(admin.created_by, 99);
assert.ok(admin.pricing, 'admin pricing object must be present');
assert.strictEqual(admin.pricing.price_amount, 2500);

console.log('verify-course-dto-shape: OK');
