/**
 * Step 1 regression: course write layer must not persist fake operational fields.
 *
 * 1) Static check: INSERT INTO courses / UPDATE courses blocks in service files
 *    must not reference lectures_count, tests_count, students_enrolled, or rating.
 * 2) Schema check: bodies with deprecated analytics keys are stripped — they never
 *    appear on parsed output passed to the service.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { courseCreateBodySchema, courseWriteBodySchema } from '../src/validators/courseWrite.schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assertCourseSqlHasNoForbiddenWrites() {
  const rel = 'src/services/course.service.js';
  const text = readFileSync(path.join(root, rel), 'utf8');
  const forbidden = [
    'lectures_count',
    'tests_count',
    'students_enrolled',
    'slug',
    'accent_color',
    'subject',
    'price',
    'original_price',
    'batch_number',
  ];
  const ins = text.indexOf('INSERT INTO courses');
  if (ins !== -1) {
    const window = text.slice(ins, ins + 900);
    for (const col of forbidden) {
      if (window.includes(col)) {
        throw new Error(`[verify-course-write-layer] ${rel} INSERT references forbidden column: ${col}`);
      }
    }
    if (/\brating\b/i.test(window)) {
      throw new Error(`[verify-course-write-layer] ${rel} INSERT references rating`);
    }
  }
  const upd = text.indexOf('UPDATE courses');
  if (upd !== -1) {
    const window = text.slice(upd, upd + 700);
    for (const col of forbidden) {
      if (window.includes(col)) {
        throw new Error(`[verify-course-write-layer] ${rel} UPDATE references forbidden column: ${col}`);
      }
    }
    if (/\brating\b/i.test(window)) {
      throw new Error(`[verify-course-write-layer] ${rel} UPDATE references rating`);
    }
  }
}

function assertSchemaStripsDeprecatedAnalytics() {
  const base = {
    title: 'Test Course Title',
    description: 'x'.repeat(12),
    level: 'beginner',
    slug: 'legacy-slug',
    accent_color: '#fff',
    batch_number: 'B1',
    subject: 'MDCAT',
    price: 0,
    rating: 5,
    studentsEnrolled: 9999,
    lecturesCount: '99',
    testsCount: '99',
    lectures_count: 1,
    tests_count: 2,
    students_enrolled: 3,
  };

  const parsed = courseWriteBodySchema.safeParse(base);
  if (!parsed.success) throw new Error('[verify-course-write-layer] expected base body to parse');

  const keys = Object.keys(parsed.data);
  const banned = [
    'rating',
    'studentsEnrolled',
    'lecturesCount',
    'testsCount',
    'lectures_count',
    'tests_count',
    'students_enrolled',
    'subject',
    'price',
    'originalPrice',
    'slug',
    'accent_color',
    'batch_number',
  ];
  for (const k of banned) {
    if (keys.includes(k)) {
      throw new Error(`[verify-course-write-layer] schema leaked forbidden key: ${k}`);
    }
  }
}

function assertCreateSchemaShapeAndStripping() {
  // courseCreateBodySchema must strip the same deprecated keys as the update schema.
  const banned = [
    'rating',
    'studentsEnrolled',
    'lecturesCount',
    'testsCount',
    'lectures_count',
    'tests_count',
    'students_enrolled',
    'subject',
    'price',
    'originalPrice',
    'slug',
    'accent_color',
    'batch_number',
  ];
  const minSubjects = [{ title: 'Unit 1', description: null }];
  const withGarbage = {
    title: 'Test Course Title',
    description: 'x'.repeat(12),
    level: 'beginner',
    subjects: minSubjects,
    slug: 'legacy-slug',
    accent_color: '#fff',
    batch_number: 'B1',
    subject: 'MDCAT',
    price: 0,
    rating: 5,
    studentsEnrolled: 9999,
    lecturesCount: '99',
    testsCount: '99',
    lectures_count: 1,
    tests_count: 2,
    students_enrolled: 3,
  };
  const parsedBase = courseCreateBodySchema.safeParse(withGarbage);
  if (!parsedBase.success) {
    throw new Error('[verify-course-write-layer] expected create schema to parse with subjects + garbage');
  }
  for (const k of banned) {
    if (Object.keys(parsedBase.data).includes(k)) {
      throw new Error(`[verify-course-write-layer] create schema leaked forbidden key: ${k}`);
    }
  }
  if (parsedBase.data.pricing != null) {
    throw new Error('[verify-course-write-layer] create schema must leave pricing undefined when not supplied');
  }
  if (!Array.isArray(parsedBase.data.subjects) || parsedBase.data.subjects.length !== 1) {
    throw new Error('[verify-course-write-layer] create schema must preserve subjects array');
  }

  const parsedWithPricing = courseCreateBodySchema.safeParse({
    title: 'Algebra II',
    description: 'A solid algebra course.',
    level: 'beginner',
    subjects: minSubjects,
    pricing: { pricing_type: 'one_time', price_amount: 2500, original_price_amount: 5000 },
  });
  if (!parsedWithPricing.success) {
    throw new Error('[verify-course-write-layer] create schema must accept valid nested pricing + subjects');
  }
  const pricing = parsedWithPricing.data.pricing;
  if (!pricing || pricing.pricing_type !== 'one_time' || pricing.price_amount !== 2500) {
    throw new Error('[verify-course-write-layer] create schema did not pass pricing through correctly');
  }

  const freeWithAmount = courseCreateBodySchema.safeParse({
    title: 'Bad Free',
    description: 'Something invalid.',
    level: 'beginner',
    subjects: minSubjects,
    pricing: { pricing_type: 'free', price_amount: 100 },
  });
  if (freeWithAmount.success) {
    throw new Error('[verify-course-write-layer] create schema must reject free + non-zero amount');
  }
  const negative = courseCreateBodySchema.safeParse({
    title: 'Bad Neg',
    description: 'Something invalid.',
    level: 'beginner',
    subjects: minSubjects,
    pricing: { pricing_type: 'one_time', price_amount: -1 },
  });
  if (negative.success) {
    throw new Error('[verify-course-write-layer] create schema must reject negative amount');
  }
  const originalBelow = courseCreateBodySchema.safeParse({
    title: 'Bad Orig',
    description: 'Something invalid.',
    level: 'beginner',
    subjects: minSubjects,
    pricing: { pricing_type: 'one_time', price_amount: 1000, original_price_amount: 500 },
  });
  if (originalBelow.success) {
    throw new Error('[verify-course-write-layer] create schema must reject original < current amount');
  }

  const noSubjects = courseCreateBodySchema.safeParse({
    title: 'No Curriculum',
    description: 'x'.repeat(12),
    level: 'beginner',
  });
  if (noSubjects.success) {
    throw new Error('[verify-course-write-layer] create schema must require at least one curriculum seed row');
  }
  const emptySubjects = courseCreateBodySchema.safeParse({
    title: 'Empty Curriculum',
    description: 'x'.repeat(12),
    level: 'beginner',
    subjects: [],
  });
  if (emptySubjects.success) {
    throw new Error('[verify-course-write-layer] create schema must reject empty curriculum seed array');
  }
}

function assertPricingServiceTouchesOnlyPricingTable() {
  const rel = 'src/services/coursePricing.service.js';
  const text = readFileSync(path.join(root, rel), 'utf8');
  if (/\bUPDATE\s+courses\b(?!_pricing)/i.test(text)) {
    throw new Error(`[verify-course-write-layer] ${rel} must not UPDATE the courses table`);
  }
  if (/\bINSERT\s+INTO\s+courses\b(?!_pricing)/i.test(text)) {
    throw new Error(`[verify-course-write-layer] ${rel} must not INSERT into the courses table`);
  }
  if (/\bDELETE\s+FROM\s+courses\b(?!_pricing)/i.test(text)) {
    throw new Error(`[verify-course-write-layer] ${rel} must not DELETE from the courses table`);
  }
}

try {
  assertCourseSqlHasNoForbiddenWrites();
  assertSchemaStripsDeprecatedAnalytics();
  assertCreateSchemaShapeAndStripping();
  assertPricingServiceTouchesOnlyPricingTable();
  console.log('verify-course-write-layer: OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
