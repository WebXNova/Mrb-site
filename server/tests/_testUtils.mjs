import assert from 'node:assert/strict';

let passed = 0;
let failed = 0;

export function test(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}`);
    if (err?.message) console.error(`    ${err.message}`);
    throw err;
  }
}

export async function testAsync(label, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}`);
    if (err?.message) console.error(`    ${err.message}`);
    throw err;
  }
}

export function eq(label, actual, expected) {
  test(label, () => assert.equal(actual, expected));
}

export function ok(label, condition) {
  test(label, () => assert.ok(condition));
}

export function deepEq(label, actual, expected) {
  test(label, () => assert.deepEqual(actual, expected));
}

export function throwsWithCode(label, fn, errorCode) {
  test(label, () => {
    let caught = null;
    try {
      fn();
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'expected error to be thrown');
    assert.equal(caught.errorCode, errorCode);
  });
}

export function summary(suiteName) {
  console.log(`\n${suiteName}: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

export function resetCounts() {
  passed = 0;
  failed = 0;
}
