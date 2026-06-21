/**
 * G-09 — publish metrics unit tests.
 *
 * Run: npm run test:publish-metrics
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  formatPublishMetricsPrometheus,
  getPublishMetricsSnapshot,
  recordPublishFailure,
  recordPublishSuccess,
  resetPublishMetricsForTests,
} from './testPublishMetrics.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..', '..');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

console.log('testPublishMetrics — G-09\n');

assert(existsSync(path.join(serverRoot, 'src/observability/testPublishMetrics.service.js')), 'metrics module exists');

const serviceText = readFileSync(path.join(serverRoot, 'src/observability/testPublishMetrics.service.js'), 'utf8');
assert(serviceText.includes('publish_success_total'), 'defines publish_success_total');
assert(serviceText.includes('publish_failure_total'), 'defines publish_failure_total');
assert(serviceText.includes('publish_duration_ms'), 'defines publish_duration_ms');

resetPublishMetricsForTests();
recordPublishSuccess({ durationMs: 250, replay: false });
recordPublishSuccess({ durationMs: 50, replay: true });
recordPublishFailure({ durationMs: 75, errorCode: 'PUBLISH_REQUIREMENTS_NOT_MET' });

const snapshot = getPublishMetricsSnapshot();
assert(snapshot.publish_success_total === 2, 'success counter');
assert(snapshot.publish_failure_total === 1, 'failure counter');
assert(snapshot.publish_duration_ms.count === 3, 'duration count includes all outcomes');
assert(snapshot.publish_duration_ms.sum === 375, 'duration sum aggregates');
assert(snapshot.publish_duration_ms.min === 50, 'duration min tracked');
assert(snapshot.publish_duration_ms.max === 250, 'duration max tracked');

const prom = formatPublishMetricsPrometheus();
assert(prom.includes('publish_success_total 2'), 'prometheus success total');
assert(prom.includes('publish_failure_total 1'), 'prometheus failure total');
assert(prom.includes('publish_success_replay_total 1'), 'prometheus replay counter');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
