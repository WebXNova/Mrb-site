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

import { courseWriteBodySchema } from '../src/validators/courseWrite.schema.js';

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

try {
  assertCourseSqlHasNoForbiddenWrites();
  assertSchemaStripsDeprecatedAnalytics();
  console.log('verify-course-write-layer: OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
