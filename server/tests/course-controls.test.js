/**
 * Course controls: catalog visibility, optional dates, mark-finished confirm, display mapping.
 * Run: node tests/course-controls.test.js
 */
import assert from 'node:assert/strict';
import { isPublicCatalogListVisible, canViewPublicCourseDetail } from '../src/services/coursePublicVisibility.service.js';
import { mapEnrollmentAccessDisplay } from '../src/dto/enrollmentAccessDisplay.dto.js';
import { courseWizardBatchItemSchema, courseWizardBodySchema } from '../src/validators/courseWizard.schema.js';
import { validatePublishRequirements } from '../src/services/coursePublishValidation.service.js';
import { courseMarkFinishedBodySchema } from '../src/validators/courseMarkFinished.schema.js';
import { PUBLIC_CATALOG_WHERE } from '../src/services/courseCatalogQueries.service.js';

function eq(actual, expected, name) {
  assert.equal(actual, expected, name);
  console.log(`  PASS ${name}`);
}

async function run() {
console.log('course-controls — visibility (Part B)\n');

eq(
  isPublicCatalogListVisible({
    is_active: 1,
    status: 'published',
    admission_status: 'CLOSED',
  }),
  false,
  'CLOSED + active published → hidden from catalog'
);

eq(
  isPublicCatalogListVisible({
    is_active: 0,
    status: 'published',
    admission_status: 'OPEN',
  }),
  false,
  'inactive + OPEN published → hidden from catalog'
);

eq(
  isPublicCatalogListVisible({
    is_active: 1,
    status: 'published',
    admission_status: 'OPEN',
  }),
  true,
  'active + OPEN published → visible in catalog'
);

eq(
  isPublicCatalogListVisible({
    is_active: 1,
    status: 'draft',
    admission_status: 'OPEN',
  }),
  false,
  'draft is not catalog-visible'
);

assert.match(PUBLIC_CATALOG_WHERE, /admission_status = 'OPEN'/);
assert.match(PUBLIC_CATALOG_WHERE, /is_active = TRUE/);
console.log('  PASS catalog SQL includes is_active AND admission OPEN');

{
  const closedPublished = { id: 9, is_active: 1, status: 'published', admission_status: 'CLOSED' };
  eq(await canViewPublicCourseDetail(closedPublished, null), false, 'CLOSED detail 404 for anonymous');
}

console.log('\ncourse-controls — display mapping (Part C)\n');

{
  const finished = mapEnrollmentAccessDisplay({
    accessStatus: 'revoked',
    enrollmentStatus: 'rejected',
    courseFinishedAt: '2026-08-28 12:00:00',
  });
  eq(finished.accessDisplayLabel, 'Course Finished', 'revoked + finished_at → Course Finished');
  assert.notEqual(finished.accessDisplayLabel, 'Rejected');
  console.log('  PASS no raw Rejected label for finished revoke');
}

{
  const other = mapEnrollmentAccessDisplay({
    accessStatus: 'revoked',
    enrollmentStatus: 'rejected',
    courseFinishedAt: null,
  });
  assert.notEqual(other.accessDisplayLabel, 'Rejected');
  eq(other.accessDisplayStatus, 'revoked', 'non-finished revoke is not Course Finished');
}

console.log('\ncourse-controls — optional dates (Part A)\n');

{
  const parsed = courseWizardBatchItemSchema.safeParse({
    title: 'Primary cohort',
    total_seats: 40,
    timezone: 'Asia/Karachi',
    status: 'draft',
    is_active: true,
    show_publicly: true,
    recordings_enabled: true,
  });
  eq(parsed.success, true, 'wizard batch without start/end dates is valid');
}

{
  const payload = {
    publish: false,
    course: {
      title: 'No Dates Course',
      description: 'A draft course description with sufficient length here.',
      level: 'beginner',
      admission_status: 'CLOSED',
    },
    pricing: { pricing_type: 'free', price_amount: 0, currency_code: 'PKR' },
    batches: [
      {
        title: 'Cohort',
        total_seats: 20,
        timezone: 'UTC',
        status: 'draft',
      },
    ],
    subjects: [{ title: 'Bio', order_index: 0 }],
  };
  const parsed = courseWizardBodySchema.safeParse(payload);
  eq(parsed.success, true, 'wizard body without course/batch dates is valid');
}

{
  validatePublishRequirements({
    publish: true,
    course: {
      title: 'Pub',
      description: 'A published course description with sufficient length here.',
      thumbnail_url: '/x.png',
    },
    pricing: { pricing_type: 'free', price_amount: 0 },
    batches: [{ title: 'B', total_seats: 10 }],
    subjects: [{ title: 'S' }],
  });
  console.log('  PASS publish validation does not require batch dates');
}

console.log('\ncourse-controls — confirm flag\n');

eq(courseMarkFinishedBodySchema.safeParse({}).success, false, 'empty body rejected');
eq(courseMarkFinishedBodySchema.safeParse({ confirm: false }).success, false, 'confirm false rejected');
eq(courseMarkFinishedBodySchema.safeParse({ confirm: true }).success, true, 'confirm true accepted');

console.log('\nAll unit checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
