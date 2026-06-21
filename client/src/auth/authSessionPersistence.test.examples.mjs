/**
 * @example node --test client/src/auth/authSessionPersistence.test.examples.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RefreshFailureKind,
  classifyRefreshHttpFailure,
  isConfirmedAuthTerminationKind,
} from './refreshFailureKind.js';

test('REFRESH_REJECTED is treated as superseded (multi-tab race)', () => {
  const kind = classifyRefreshHttpFailure(401, 'Invalid refresh token', 'REFRESH_REJECTED');
  assert.equal(kind, RefreshFailureKind.REFRESH_SUPERSEDED);
  assert.equal(isConfirmedAuthTerminationKind(kind), false);
});

test('REFRESH_SUPERSEDED is not a confirmed auth termination', () => {
  const kind = classifyRefreshHttpFailure(401, 'Invalid refresh token', 'REFRESH_SUPERSEDED');
  assert.equal(kind, RefreshFailureKind.REFRESH_SUPERSEDED);
  assert.equal(isConfirmedAuthTerminationKind(kind), false);
});

test('REFRESH_REPLAY_REJECTED is a confirmed auth termination', () => {
  const kind = classifyRefreshHttpFailure(401, 'Session requires re-authentication', 'REFRESH_REPLAY_REJECTED');
  assert.equal(kind, RefreshFailureKind.REVOKED_SESSION);
  assert.equal(isConfirmedAuthTerminationKind(kind), true);
});

test('CSRF mismatch is transient, not termination', () => {
  const kind = classifyRefreshHttpFailure(403, 'CSRF token mismatch');
  assert.equal(kind, RefreshFailureKind.CSRF_MISMATCH);
  assert.equal(isConfirmedAuthTerminationKind(kind), false);
});
