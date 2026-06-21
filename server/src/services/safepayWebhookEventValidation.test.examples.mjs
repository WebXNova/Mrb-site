/**
 * Unit tests — Safepay webhook event validation (fail-closed allowlist).
 *
 * Run: node src/services/safepayWebhookEventValidation.test.examples.mjs
 */
import {
  ALLOWED_SUCCESS_EVENTS,
  classifySafepayWebhookEvent,
  extractSafepayWebhookEventFields,
  isEmptySafepayWebhookPayload,
  isSafepayPaymentSuccessEvent,
} from './safepayWebhookEventValidation.js';

let passed = 0;
let failed = 0;

function ok(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

function eq(label, actual, expected) {
  ok(label, actual === expected);
}

/**
 * @typedef {object} UnitCase
 * @property {string} id
 * @property {string} description
 * @property {unknown} payload
 * @property {'success'|'failure'|'ignored'|'rejected'} expectedOutcome
 * @property {boolean} expectedFulfills
 * @property {string} expectedReasonPrefix
 */

/** @type {UnitCase[]} */
const REQUIRED_CASES = [
  {
    id: 'U01',
    description: 'valid success event (payment.succeeded)',
    payload: { type: 'payment.succeeded', data: { token: 'tok_abc' } },
    expectedOutcome: 'success',
    expectedFulfills: true,
    expectedReasonPrefix: 'allowed_event_type',
  },
  {
    id: 'U02',
    description: 'valid failed event (payment.failed)',
    payload: { type: 'payment.failed', data: { token: 'tok_abc' } },
    expectedOutcome: 'failure',
    expectedFulfills: false,
    expectedReasonPrefix: 'known_failure_event_type',
  },
  {
    id: 'U03',
    description: 'unknown event',
    payload: { type: 'checkout.session.updated', data: { token: 'tok_abc' } },
    expectedOutcome: 'ignored',
    expectedFulfills: false,
    expectedReasonPrefix: 'unknown_event_type',
  },
  {
    id: 'U04',
    description: 'empty payload',
    payload: {},
    expectedOutcome: 'rejected',
    expectedFulfills: false,
    expectedReasonPrefix: 'empty_or_invalid_payload',
  },
  {
    id: 'U05',
    description: 'missing type (state only, non-allowlisted)',
    payload: { data: { tracker: { state: 'PENDING', token: 'tok' } } },
    expectedOutcome: 'ignored',
    expectedFulfills: false,
    expectedReasonPrefix: 'unknown_tracker_state',
  },
  {
    id: 'U06',
    description: 'missing state (type only, non-allowlisted)',
    payload: { type: 'tracker.updated', data: { token: 'tok' } },
    expectedOutcome: 'ignored',
    expectedFulfills: false,
    expectedReasonPrefix: 'unknown_event_type',
  },
  {
    id: 'U07',
    description: 'missing type and state (token only)',
    payload: { data: { token: 'tok_only' } },
    expectedOutcome: 'ignored',
    expectedFulfills: false,
    expectedReasonPrefix: 'missing_type_and_state',
  },
  {
    id: 'U09',
    description: 'tracker_started lifecycle event (non-terminal)',
    payload: { type: 'tracker_started', data: { token: 'tok_abc' } },
    expectedOutcome: 'ignored',
    expectedFulfills: false,
    expectedReasonPrefix: 'unknown_event_type',
  },
];

console.log('safepayWebhookEventValidation — unit tests\n');

console.log('Phase 1 — Allowlist contract');
ok('ALLOWED_SUCCESS_EVENTS is frozen', Object.isFrozen(ALLOWED_SUCCESS_EVENTS));
ok('includes payment.succeeded', ALLOWED_SUCCESS_EVENTS.includes('payment.succeeded'));
ok('includes TRACKER_ENDED', ALLOWED_SUCCESS_EVENTS.includes('TRACKER_ENDED'));

console.log('\nPhase 2 — Required scenario matrix');
for (const c of REQUIRED_CASES) {
  const result = classifySafepayWebhookEvent(c.payload);
  eq(`${c.id} ${c.description} → outcome`, result.outcome, c.expectedOutcome);
  ok(
    `${c.id} reason starts with "${c.expectedReasonPrefix}"`,
    result.reason === c.expectedReasonPrefix || result.reason.startsWith(c.expectedReasonPrefix)
  );
  eq(
    `${c.id} isSafepayPaymentSuccessEvent`,
    isSafepayPaymentSuccessEvent(c.payload),
    c.expectedFulfills
  );
}

console.log('\nPhase 3 — Additional allowlisted success shapes');
{
  const byStatePayload = { data: { tracker: { state: 'TRACKER_ENDED', token: 't' } } };
  const byState = classifySafepayWebhookEvent(byStatePayload);
  eq('TRACKER_ENDED state → success', byState.outcome, 'success');
  eq('TRACKER_ENDED fulfills', isSafepayPaymentSuccessEvent(byStatePayload), true);

  const paymentsSucceeded = classifySafepayWebhookEvent({ type: 'payments.succeeded' });
  eq('payments.succeeded → success', paymentsSucceeded.outcome, 'success');
}

console.log('\nPhase 4 — Fail-closed regression traps (must NOT fulfill)');
const traps = [
  { label: 'null payload', payload: null },
  { label: 'array payload', payload: [] },
  { label: 'substring complete', payload: { type: 'incomplete' } },
  { label: 'substring success', payload: { type: 'unsuccessful' } },
  { label: 'substring paid', payload: { type: 'prepaid_plan' } },
  { label: 'intermediate TRACKER_STARTED state', payload: { data: { tracker: { state: 'TRACKER_STARTED' } } } },
];

for (const trap of traps) {
  const result = classifySafepayWebhookEvent(trap.payload);
  ok(`${trap.label} does not fulfill`, result.outcome !== 'success');
  ok(`${trap.label} isSafepayPaymentSuccessEvent false`, !isSafepayPaymentSuccessEvent(trap.payload));
}

console.log('\nPhase 5 — Field extraction');
{
  const fields = extractSafepayWebhookEventFields({
    event: 'Payment.Succeeded',
    data: { tracker: { state: 'tracker_ended' } },
  });
  eq('normalizes type lowercase', fields.type, 'payment.succeeded');
  eq('normalizes state uppercase', fields.state, 'TRACKER_ENDED');
  ok('empty payload helper', isEmptySafepayWebhookPayload({}));
  ok('non-empty payload helper', !isEmptySafepayWebhookPayload({ type: 'x' }));
}

console.log('\n--- Expected results (unit) ---');
console.log('| ID  | Scenario              | Outcome   | Fulfills |');
console.log('|-----|-----------------------|-----------|----------|');
for (const c of REQUIRED_CASES) {
  const fulfills = c.expectedFulfills ? 'YES' : 'NO';
  console.log(`| ${c.id} | ${c.description.padEnd(21)} | ${c.expectedOutcome.padEnd(9)} | ${fulfills.padEnd(8)} |`);
}
console.log('| U08 | malformed JSON        | rejected* | NO       |');
console.log('|     | (*ingress layer)     |           |          |');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
