/**
 * Unit tests — Safepay webhook settlement (amount + currency verification).
 *
 * Run: node src/services/safepayWebhookSettlement.test.examples.mjs
 */
import {
  comparePaidAmountToOrder,
  extractSafepayPaidAmountFromWebhook,
  extractSafepayPaidCurrencyFromWebhook,
  majorUnitsToMinorUnits,
  normalizeCurrencyCode,
  verifyWebhookSettlementAgainstOrder,
} from './safepayWebhookSettlement.js';

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

const ORDER = { amount: 15000, currency: 'PKR' };
const EXPECTED_MINOR = 1500000;

function successPayload({ amount = EXPECTED_MINOR, currency = 'PKR', token = 'tok_unit' } = {}) {
  return {
    type: 'payment.succeeded',
    data: { token, amount, currency },
  };
}

console.log('safepayWebhookSettlement — unit tests\n');

console.log('Phase 1 — Amount / currency extraction');
{
  const payload = successPayload();
  eq('extract amount (minor)', extractSafepayPaidAmountFromWebhook(payload), EXPECTED_MINOR);
  eq('extract currency', extractSafepayPaidCurrencyFromWebhook(payload), 'PKR');
  eq('normalize currency', normalizeCurrencyCode(' pkr '), 'PKR');
  eq('major→minor', majorUnitsToMinorUnits(15000), EXPECTED_MINOR);
}

console.log('\nPhase 2 — comparePaidAmountToOrder');
{
  const minor = comparePaidAmountToOrder(EXPECTED_MINOR, ORDER.amount);
  ok('exact minor match', minor.matches && minor.matchKind === 'minor');

  const major = comparePaidAmountToOrder(ORDER.amount, ORDER.amount);
  ok('exact major match', major.matches && major.matchKind === 'major');

  const decimal = comparePaidAmountToOrder(1500000.5, ORDER.amount);
  ok('decimal rejected', decimal.matches === false);

  const low = comparePaidAmountToOrder(EXPECTED_MINOR - 1, ORDER.amount);
  ok('off-by-one paisa rejected', low.matches === false);
}

console.log('\nPhase 3 — Penetration scenarios (settlement must reject)');
/** @type {Array<{ id: string, label: string, payload: object, expectedReason: string }>} */
const PENETRATION_UNIT_CASES = [
  {
    id: 'P01',
    label: 'lower amount paid (minor)',
    payload: successPayload({ amount: EXPECTED_MINOR - 100 }),
    expectedReason: 'amount_too_low',
  },
  {
    id: 'P02',
    label: 'higher amount paid (minor)',
    payload: successPayload({ amount: EXPECTED_MINOR + 100 }),
    expectedReason: 'amount_too_high',
  },
  {
    id: 'P03',
    label: 'currency mismatch',
    payload: successPayload({ currency: 'USD' }),
    expectedReason: 'currency_mismatch',
  },
  {
    id: 'P04',
    label: 'decimal mismatch',
    payload: successPayload({ amount: EXPECTED_MINOR + 0.5 }),
    expectedReason: 'decimal_amount_rejected',
  },
  {
    id: 'P05',
    label: 'rounding mismatch (1 paisa short)',
    payload: successPayload({ amount: EXPECTED_MINOR - 1 }),
    expectedReason: 'amount_too_low',
  },
  {
    id: 'P06',
    label: 'missing amount',
    payload: { type: 'payment.succeeded', data: { token: 'tok', currency: 'PKR' } },
    expectedReason: 'missing_paid_amount',
  },
  {
    id: 'P07',
    label: 'missing currency',
    payload: { type: 'payment.succeeded', data: { token: 'tok', amount: EXPECTED_MINOR } },
    expectedReason: 'missing_paid_currency',
  },
];

for (const c of PENETRATION_UNIT_CASES) {
  const result = verifyWebhookSettlementAgainstOrder(ORDER, c.payload);
  ok(`${c.id} ${c.label} → rejected`, result.ok === false);
  eq(`${c.id} reason`, result.reason, c.expectedReason);
}

console.log('\nPhase 4 — Valid settlement baseline');
{
  const result = verifyWebhookSettlementAgainstOrder(ORDER, successPayload());
  ok('exact minor + currency → ok', result.ok === true);
  eq('reason', result.reason, 'settlement_verified');

  const majorPayload = successPayload({ amount: ORDER.amount });
  const majorResult = verifyWebhookSettlementAgainstOrder(ORDER, majorPayload);
  ok('exact major + currency → ok', majorResult.ok === true);
}

console.log('\nPhase 5 — Alternate webhook amount paths');
{
  const nested = {
    type: 'payment.succeeded',
    data: { token: 't', tracker: { amount: EXPECTED_MINOR, currency: 'PKR' } },
  };
  ok('nested tracker amount', verifyWebhookSettlementAgainstOrder(ORDER, nested).ok === true);

  const paymentRoot = {
    type: 'payment.succeeded',
    data: { token: 't' },
    payment: { amount: EXPECTED_MINOR, currency: 'PKR' },
  };
  ok('payment.* path', verifyWebhookSettlementAgainstOrder(ORDER, paymentRoot).ok === true);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
