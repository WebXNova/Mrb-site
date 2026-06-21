/**
 * Validates batch delivery schedule (start → end).
 */
import assert from 'node:assert';
import { validateBatchScheduleWindow, parseBatchTimestamp } from '../src/utils/batchDateTime.js';
import { validateEnrollmentWindow } from '../src/services/courseBatch.service.js';
import { courseBatchCreateBodySchema } from '../src/validators/courseBatch.schema.js';
import { courseWizardBatchItemSchema } from '../src/validators/courseWizard.schema.js';
import { ApiError } from '../src/utils/apiError.js';

function deliveryScenario() {
  const now = new Date();
  const start = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const end = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();
  return { start, end };
}

function testDeliveryScenarioPasses() {
  const { start, end } = deliveryScenario();
  const row = { start_date: start, end_date: end };
  const result = validateBatchScheduleWindow(row);
  assert.equal(result.ok, true, `expected pass, got: ${result.ok === false ? result.message : ''}`);
  validateEnrollmentWindow(row);
}

function testEndBeforeStartFails() {
  const { start, end } = deliveryScenario();
  let threw = false;
  try {
    validateEnrollmentWindow({ start_date: end, end_date: start });
  } catch (e) {
    threw = true;
    assert.ok(e instanceof ApiError);
    assert.equal(e.statusCode, 422);
  }
  assert.ok(threw, 'end before start should fail');
}

function testZodCreateSchemaAcceptsDatetime() {
  const { start, end } = deliveryScenario();
  const parsed = courseBatchCreateBodySchema.safeParse({
    title: 'Delivery Batch',
    code: 'DELIVERY-01',
    start_date: start,
    end_date: end,
    total_seats: 20,
    timezone: 'Asia/Karachi',
  });
  assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error?.flatten?.()));
}

function testWizardSchemaAcceptsDatetime() {
  const { start, end } = deliveryScenario();
  const parsed = courseWizardBatchItemSchema.safeParse({
    title: 'Wizard Delivery',
    start_date: start,
    end_date: end,
    total_seats: 20,
    timezone: 'Asia/Karachi',
  });
  assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error?.flatten?.()));
}

function testParseBatchTimestamp() {
  assert.ok(Number.isFinite(parseBatchTimestamp('2026-06-19')));
  assert.ok(Number.isFinite(parseBatchTimestamp('2026-06-19 15:00:00')));
  assert.ok(Number.isFinite(parseBatchTimestamp('2026-06-19T10:00:00.000Z')));
}

const cases = [
  ['parseBatchTimestamp', testParseBatchTimestamp],
  ['delivery scenario passes', testDeliveryScenarioPasses],
  ['end before start fails', testEndBeforeStartFails],
  ['zod create schema', testZodCreateSchemaAcceptsDatetime],
  ['wizard schema', testWizardSchemaAcceptsDatetime],
];

for (const [name, fn] of cases) {
  process.stdout.write(`Running ${name}... `);
  fn();
  console.log('ok');
}

console.log('verify-batch-datetime-validation: OK');
