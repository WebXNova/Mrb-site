import assert from 'node:assert/strict';
import { parseJwtDurationMs, DEFAULT_REFRESH_MS } from '../src/utils/jwtDuration.js';

assert.equal(parseJwtDurationMs('90d'), 90 * 24 * 60 * 60 * 1000);
assert.equal(parseJwtDurationMs('7d'), 7 * 24 * 60 * 60 * 1000);
assert.equal(parseJwtDurationMs('15m'), 15 * 60 * 1000);
assert.equal(parseJwtDurationMs('invalid', DEFAULT_REFRESH_MS), DEFAULT_REFRESH_MS);
assert.equal(parseJwtDurationMs(null, 1234), 1234);

console.log('jwtDuration tests passed');
