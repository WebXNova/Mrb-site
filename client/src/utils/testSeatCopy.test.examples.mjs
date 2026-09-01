import { formatQuestionCount, formatSeatRemaining } from './testSeatCopy.js';

function assert(cond, label) {
  if (!cond) {
    console.error(`FAIL ${label}`);
    process.exitCode = 1;
    return;
  }
  console.log(`  ✓ ${label}`);
}

assert(formatSeatRemaining(0, 200).isFull, 'zero remaining is full');
assert(formatSeatRemaining(8, 200).tone === 'urgent', '8 remaining is urgent');
assert(formatSeatRemaining(173, 200).label.includes('173'), 'large remaining shows count');
assert(formatQuestionCount(1) === '1 question', 'singular question');
assert(formatQuestionCount(50) === '50 questions', 'plural questions');

if (process.exitCode) {
  console.error('testSeatCopy failed');
} else {
  console.log('testSeatCopy passed');
}
