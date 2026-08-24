/**
 * Attempt JWT TTL + submit grace window.
 *
 * Run: node src/services/attemptTiming.jwt.test.examples.mjs
 */
import assert from 'node:assert/strict';
import {
  isWithinSubmitGraceWindow,
  resolveAttemptJwtExpiresInSeconds,
  SUBMIT_GRACE_MS,
} from './attemptTiming.service.js';

const now = Date.parse('2026-08-22T12:00:00.000Z');

const thirtyMin = resolveAttemptJwtExpiresInSeconds({
  durationMinutes: 30,
  nowMs: now,
});
assert.equal(thirtyMin, 30 * 60 + 120);

const fromExpiresAt = resolveAttemptJwtExpiresInSeconds({
  expiresAt: '2026-08-22T13:00:00.000Z',
  nowMs: now,
});
assert.equal(fromExpiresAt, 60 * 60 + 120);

const unlimited = resolveAttemptJwtExpiresInSeconds({ nowMs: now });
assert.equal(unlimited, 8 * 60 * 60);

const tenHour = resolveAttemptJwtExpiresInSeconds({
  durationMinutes: 600,
  nowMs: now,
});
assert.equal(tenHour, 600 * 60 + 120);
assert.ok(tenHour > 8 * 60 * 60);

const expiresAt = now;
assert.equal(isWithinSubmitGraceWindow(now, expiresAt), true);
assert.equal(isWithinSubmitGraceWindow(now + SUBMIT_GRACE_MS, expiresAt), true);
assert.equal(isWithinSubmitGraceWindow(now + SUBMIT_GRACE_MS + 1, expiresAt), false);

console.log('attemptTiming JWT TTL + submit grace: all assertions passed');
