/**
 * PUT /admin/courses/:id must accept partial bodies (admission-only save).
 * Run: node tests/course-partial-write.test.js
 */
import assert from 'node:assert/strict';
import { courseWriteBodySchema, courseCreateBodySchema } from '../src/validators/courseWrite.schema.js';
import { mergeCourseUpdatePayload } from '../src/services/course.service.js';

function eq(actual, expected, name) {
  assert.equal(actual, expected, name);
  console.log(`  PASS ${name}`);
}

console.log('course-partial-write — admission-only PUT schema\n');

{
  const parsed = courseWriteBodySchema.safeParse({ admission_status: 'OPEN' });
  assert.equal(parsed.success, true, 'admission-only body parses');
  eq(parsed.data.admission_status, 'OPEN', 'admission_status OPEN is kept');
  assert.equal(parsed.data.title, undefined, 'title is not required on PUT');
}

{
  const parsed = courseWriteBodySchema.safeParse({ admission_status: 'CLOSED' });
  assert.equal(parsed.success, true);
  eq(parsed.data.admission_status, 'CLOSED', 'admission_status CLOSED is kept');
}

{
  const parsed = courseWriteBodySchema.safeParse({});
  assert.equal(parsed.success, false, 'empty PUT body is rejected');
}

{
  const parsed = courseWriteBodySchema.safeParse({
    title: 'Physics from zero to hero',
    description: 'x'.repeat(12),
    level: 'beginner',
  });
  assert.equal(parsed.success, true, 'full identity PUT still parses');
}

{
  const parsed = courseWriteBodySchema.safeParse({ title: 'Only title' });
  assert.equal(parsed.success, false, 'identity PUT still requires description and level');
}

{
  const parsed = courseCreateBodySchema.safeParse({ admission_status: 'OPEN' });
  assert.equal(parsed.success, false, 'create still requires title/description/subjects');
}

console.log('\ncourse-partial-write — merge keeps identity\n');

{
  const existing = {
    title: 'Keep this title',
    description: 'Existing description text',
    short_description: 'Short',
    level: 'intermediate',
    image_url: '/uploads/thumb.jpg',
    is_active: 1,
    status: 'published',
    start_date: null,
    end_date: null,
    admission_status: 'CLOSED',
  };
  const next = mergeCourseUpdatePayload(existing, { admission_status: 'OPEN' });
  eq(next.title, 'Keep this title', 'title preserved');
  eq(next.description, 'Existing description text', 'description preserved');
  eq(next.level, 'intermediate', 'level preserved');
  eq(next.thumbnail_url, '/uploads/thumb.jpg', 'thumbnail preserved');
  eq(next.is_active, true, 'is_active unchanged');
  eq(next.status, 'published', 'status unchanged');
  eq(next.admission_status, 'OPEN', 'admission updated');
}

{
  const existing = {
    title: 'Draft course',
    description: 'Draft description text',
    short_description: null,
    level: 'beginner',
    image_url: null,
    is_active: 0,
    status: 'draft',
    start_date: null,
    end_date: null,
    admission_status: 'CLOSED',
  };
  const next = mergeCourseUpdatePayload(existing, { status: 'published', is_active: true });
  eq(next.status, 'published', 'publish writes status');
  eq(next.is_active, true, 'publish writes is_active');
  eq(next.title, 'Draft course', 'publish does not wipe title');
}

console.log('\nAll course-partial-write checks passed.');
