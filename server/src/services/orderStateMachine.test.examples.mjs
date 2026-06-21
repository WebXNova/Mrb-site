/**
 * Unit tests — strict order state machine.
 * Run: node src/services/orderStateMachine.test.examples.mjs
 */
import {
  ALLOWED_ORDER_TRANSITIONS,
  canTransitionOrderStatus,
  isOrderPayableFromWebhook,
  isTerminalNonPayableOrderStatus,
} from './orderStateMachine.service.js';

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

console.log('orderStateMachine — unit tests\n');

ok('pending → paid allowed', canTransitionOrderStatus('pending', 'paid'));
ok('pending → failed allowed', canTransitionOrderStatus('pending', 'failed'));
ok('pending → cancelled allowed', canTransitionOrderStatus('pending', 'cancelled'));
ok('paid → refunded allowed', canTransitionOrderStatus('paid', 'refunded'));
ok('cancelled → paid forbidden', !canTransitionOrderStatus('cancelled', 'paid'));
ok('failed → paid forbidden', !canTransitionOrderStatus('failed', 'paid'));
ok('refunded → paid forbidden', !canTransitionOrderStatus('refunded', 'paid'));
ok('cancelled → refunded forbidden', !canTransitionOrderStatus('cancelled', 'refunded'));
ok('failed → refunded forbidden', !canTransitionOrderStatus('failed', 'refunded'));
ok('only pending is webhook-payable', isOrderPayableFromWebhook('pending'));
ok('cancelled is terminal non-payable', isTerminalNonPayableOrderStatus('cancelled'));
ok('failed is terminal non-payable', isTerminalNonPayableOrderStatus('failed'));
ok('refunded is terminal non-payable', isTerminalNonPayableOrderStatus('refunded'));
ok('paid is not terminal non-payable', !isTerminalNonPayableOrderStatus('paid'));
ok('pending transitions frozen', Object.isFrozen(ALLOWED_ORDER_TRANSITIONS.pending));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
