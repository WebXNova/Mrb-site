/**
 * E2E-style checks for the course wizard flow:
 * 1) Draft creation (course inactive, single batch, pricing, subjects)
 * 2) Publish flow (course active, batch active/upcoming, pricing active)
 * 3) Duplicate batch rejection (single-batch invariant)
 * 4) DATETIME normalization (stored as "YYYY-MM-DD HH:mm:ss", no ISO "T")
 * 5) Transaction rollback (invalid payload leaves no rows)
 * 6) Idempotency behavior (same key+payload replays, no second execution path)
 *
 * Minimal mocking: uses real services + mysqlPool.
 */
import assert from 'node:assert';
import { mysqlPool } from '../src/config/mysql.js';
import { createCourseWizardTransaction } from '../src/services/courseWizard.service.js';
import { createBatch } from '../src/services/courseBatch.service.js';
import { checkIdempotency, storeIdempotencyResponse } from '../src/services/idempotency.service.js';
import { ApiError } from '../src/utils/apiError.js';

async function resetTables() {
  await mysqlPool.query('DELETE FROM subjects');
  await mysqlPool.query('DELETE FROM course_batches');
  await mysqlPool.query('DELETE FROM course_pricing');
  await mysqlPool.query('DELETE FROM courses');
  await mysqlPool.query('DELETE FROM idempotency_keys');
}

function draftPayload() {
  const now = new Date();
  const open = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const close = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const start = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
  return {
    publish: false,
    course: {
      title: 'Draft Course',
      description: 'A draft course description with sufficient length.',
      short_description: 'Short desc',
      level: 'beginner',
      thumbnail_url: null,
      is_active: true, // will be resolved to false because publish=false
    },
    pricing: {
      pricing_type: 'one_time',
      price_amount: 2000,
      original_price_amount: 2500,
      currency_code: 'PKR',
      is_active: true,
    },
    batches: [
      {
        title: 'Draft Batch',
        start_date: start.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
        enrollment_open_at: open,
        enrollment_close_at: close,
        total_seats: 30,
        instructor_name: 'Instructor',
        schedule_label: 'Evenings',
        timezone: 'UTC',
        status: 'draft',
        is_active: true,
        allow_enrollment: true,
        show_publicly: true,
        certificate_enabled: false,
        recordings_enabled: true,
      },
    ],
    subjects: [
      { title: 'Subject 1', description: 'Desc 1', order_index: 0 },
    ],
  };
}

function publishPayload() {
  const now = new Date();
  const open = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const close = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const start = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
  return {
    publish: true,
    course: {
      title: 'Publish Course',
      description: 'A published course description with sufficient length.',
      short_description: 'Short desc',
      level: 'intermediate',
      thumbnail_url: 'http://example.com/thumb.jpg',
      is_active: true,
    },
    pricing: {
      pricing_type: 'one_time',
      price_amount: 3000,
      original_price_amount: 3500,
      currency_code: 'PKR',
      is_active: true,
    },
    batches: [
      {
        title: 'Publish Batch',
        start_date: start.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
        enrollment_open_at: open,
        enrollment_close_at: close,
        total_seats: 40,
        instructor_name: 'Instructor P',
        schedule_label: 'Mornings',
        timezone: 'UTC',
        status: 'draft', // will be auto-upgraded to upcoming for publish
        is_active: true,
        allow_enrollment: true,
        show_publicly: true,
        certificate_enabled: false,
        recordings_enabled: true,
      },
    ],
    subjects: [
      { title: 'Subject P1', description: 'Desc P1', order_index: 0 },
    ],
  };
}

async function fetchCounts() {
  const [[{ c_courses }]] = await mysqlPool.query('SELECT COUNT(*) AS c_courses FROM courses');
  const [[{ c_pricing }]] = await mysqlPool.query('SELECT COUNT(*) AS c_pricing FROM course_pricing');
  const [[{ c_batches }]] = await mysqlPool.query('SELECT COUNT(*) AS c_batches FROM course_batches');
  const [[{ c_subjects }]] = await mysqlPool.query('SELECT COUNT(*) AS c_subjects FROM subjects');
  return { c_courses, c_pricing, c_batches, c_subjects };
}

async function assertDatetimeNormalized(table, col) {
  const [rows] = await mysqlPool.query(`SELECT ${col} AS dt FROM ${table} ORDER BY id DESC LIMIT 1`);
  const dt = rows[0]?.dt ? String(rows[0].dt) : '';
  if (dt.includes('T')) {
    throw new Error(`[datetime] ${table}.${col} stored in ISO form (has "T"): ${dt}`);
  }
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dt)) {
    throw new Error(`[datetime] ${table}.${col} not in "YYYY-MM-DD HH:mm:ss" format: ${dt}`);
  }
}

async function testDraftCreation() {
  await resetTables();
  const created = await createCourseWizardTransaction(draftPayload(), null, {});
  assert.ok(created.id, 'draft course should return id');
  const rowCounts = await fetchCounts();
  assert.equal(rowCounts.c_courses, 1, 'one course');
  assert.equal(rowCounts.c_pricing, 1, 'one pricing');
  assert.equal(rowCounts.c_batches, 1, 'one batch');
  assert.equal(rowCounts.c_subjects, 1, 'one subject');
  const [courses] = await mysqlPool.query('SELECT is_active FROM courses WHERE id = ?', [created.id]);
  assert.equal(Number(courses[0].is_active), 0, 'draft course is inactive');
}

async function testPublishFlow() {
  await resetTables();
  const created = await createCourseWizardTransaction(publishPayload(), null, {});
  const [course] = await mysqlPool.query('SELECT is_active FROM courses WHERE id = ?', [created.id]);
  assert.equal(Number(course[0].is_active), 1, 'published course is active');
  const [batch] = await mysqlPool.query('SELECT is_active, status FROM course_batches WHERE course_id = ?', [created.id]);
  assert.equal(Number(batch[0].is_active), 1, 'batch active');
  assert.ok(['upcoming', 'published', 'enrollment_open', 'running'].includes(String(batch[0].status)), 'batch status upgraded from draft');
  const [pricing] = await mysqlPool.query('SELECT is_active FROM course_pricing WHERE course_id = ?', [created.id]);
  assert.equal(Number(pricing[0].is_active), 1, 'pricing active');
}

async function testDuplicateBatchRejection() {
  await resetTables();
  const created = await createCourseWizardTransaction(draftPayload(), null, {});
  let threw = false;
  try {
    await createBatch(created.id, draftPayload().batches[0], null);
  } catch (err) {
    threw = true;
    assert.ok(err instanceof ApiError, 'error should be ApiError');
    assert.equal(err.statusCode, 409);
    assert.equal(err.details?.code, 'COURSE_BATCH_LIMIT_REACHED');
  }
  assert.ok(threw, 'should reject second batch creation');
}

async function testDatetimeNormalization() {
  await resetTables();
  await createCourseWizardTransaction(publishPayload(), null, {});
  await assertDatetimeNormalized('course_batches', 'enrollment_open_at');
  await assertDatetimeNormalized('course_batches', 'enrollment_close_at');
  const [pricing] = await mysqlPool.query('SELECT starts_at, ends_at FROM course_pricing ORDER BY id DESC LIMIT 1');
  if (pricing[0].starts_at) {
    if (String(pricing[0].starts_at).includes('T')) throw new Error('[datetime] pricing.starts_at has "T"');
  }
  if (pricing[0].ends_at) {
    if (String(pricing[0].ends_at).includes('T')) throw new Error('[datetime] pricing.ends_at has "T"');
  }
}

async function testRollbackOnFailure() {
  await resetTables();
  const badPayload = draftPayload();
  // Force invalid enrollment window: close before open
  badPayload.batches[0].enrollment_close_at = badPayload.batches[0].enrollment_open_at;
  let threw = false;
  try {
    await createCourseWizardTransaction(badPayload, null, {});
  } catch (err) {
    threw = true;
  }
  assert.ok(threw, 'should fail invalid payload');
  const rowCounts = await fetchCounts();
  assert.deepEqual(rowCounts, { c_courses: 0, c_pricing: 0, c_batches: 0, c_subjects: 0 }, 'no rows after rollback');
}

async function testIdempotencyBehavior() {
  await resetTables();
  const payload = draftPayload();
  const key = 'test-key-123';
  // First request would create the course and store response; simulate storing
  const created = await createCourseWizardTransaction(payload, null, {});
  await storeIdempotencyResponse(key, payload, 201, { id: created.id }, '/api/admin/courses/wizard', 'POST', null);
  // Second request with same key+payload should replay
  const replay = await checkIdempotency(key, payload, '/api/admin/courses/wizard', 'POST');
  assert.equal(replay.replay, true, 'should replay');
  assert.equal(replay.statusCode, 201, 'replay status');
  // Ensure no extra course created
  const rowCounts = await fetchCounts();
  assert.equal(rowCounts.c_courses, 1, 'no duplicate course on replay');
}

async function main() {
  const cases = [
    ['draft creation', testDraftCreation],
    ['publish flow', testPublishFlow],
    ['duplicate batch rejection', testDuplicateBatchRejection],
    ['datetime normalization', testDatetimeNormalization],
    ['transaction rollback', testRollbackOnFailure],
    ['idempotency behavior', testIdempotencyBehavior],
  ];
  for (const [name, fn] of cases) {
    process.stdout.write(`Running ${name}... `);
    await fn();
    console.log('ok');
  }
  console.log('All course wizard checks passed.');
  await mysqlPool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

