import assert from 'node:assert/strict';
import {
  ReplayRiskLevel,
  classifyRefreshReplayRisk,
  evaluateReplayEnvironment,
  getReplayGraceMs,
  isWithinReplayGraceWindow,
} from '../src/services/refreshReplayRisk.service.js';

assert.equal(getReplayGraceMs(), 60_000);

const recent = new Date(Date.now() - 5_000).toISOString();
const stale = new Date(Date.now() - 120_000).toISOString();

assert.equal(isWithinReplayGraceWindow(recent), true);
assert.equal(isWithinReplayGraceWindow(stale), false);

const baseline = evaluateReplayEnvironment({
  lastIpHash: null,
  lastUaHash: null,
  clientIp: '192.168.1.10',
  userAgent: 'Mozilla/5.0',
});

const lowRisk = classifyRefreshReplayRisk({
  session: {
    last_used_at: recent,
    last_ip_hash: baseline.incomingIpHash,
    ua_fingerprint: baseline.incomingUaHash,
  },
  clientIp: '192.168.1.10',
  userAgent: 'Mozilla/5.0',
});
assert.equal(lowRisk.level, ReplayRiskLevel.LOW);
assert.equal(lowRisk.reason, 'tab_race');

const highRiskGrace = classifyRefreshReplayRisk({
  session: {
    last_used_at: stale,
    last_ip_hash: baseline.incomingIpHash,
    ua_fingerprint: baseline.incomingUaHash,
  },
  clientIp: '192.168.1.10',
  userAgent: 'Mozilla/5.0',
});
assert.equal(highRiskGrace.level, ReplayRiskLevel.HIGH);
assert.equal(highRiskGrace.reason, 'outside_grace_window');

const highRiskUa = classifyRefreshReplayRisk({
  session: {
    last_used_at: recent,
    last_ip_hash: baseline.incomingIpHash,
    ua_fingerprint: baseline.incomingUaHash,
  },
  clientIp: '192.168.1.10',
  userAgent: 'curl/8.0 attacker',
});
assert.equal(highRiskUa.level, ReplayRiskLevel.HIGH);
assert.equal(highRiskUa.reason, 'browser_fingerprint_mismatch');

console.log('refresh replay risk tests passed');
