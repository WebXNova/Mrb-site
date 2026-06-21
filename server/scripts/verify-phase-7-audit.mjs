/**
 * Phase 7 meta-verification — all workstream docs + npm scripts present.
 * Run: npm run test:phase-7 (includes this after all suites)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');

function ok(label) {
  console.log(`PASS ${label}`);
}

function mustExist(rel) {
  const full = path.join(serverRoot, rel);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing: ${rel}`);
  }
  ok(rel);
}

console.log('Phase 7 — meta verification audit\n');

mustExist('docs/phase-7-verification-audit.md');
mustExist('docs/student-runtime-architecture.md');
mustExist('docs/test-availability-window.md');
mustExist('docs/test-retake-policy.md');
mustExist('docs/test-delivery-layout.md');
mustExist('docs/test-result-visibility.md');
mustExist('docs/student-runtime-hardening.md');

mustExist('src/runtime/studentRuntimeCanonical.js');
mustExist('src/runtime/legacyRuntimeDeprecation.js');
mustExist('src/services/testAvailabilityWindow.service.js');
mustExist('src/services/testRetakePolicy.service.js');
mustExist('src/services/attemptDeliveryLayout.service.js');
mustExist('src/services/testResultVisibility.service.js');
mustExist('src/observability/studentRuntimeMetrics.service.js');

const pkg = JSON.parse(fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf8'));
const scripts = [
  'test:student-runtime-unification',
  'test:availability-window',
  'test:retake-policy',
  'test:delivery-layout',
  'test:result-visibility',
  'test:student-runtime-hardening',
  'test:phase-7',
];

for (const name of scripts) {
  if (!pkg.scripts?.[name]) {
    throw new Error(`Missing npm script: ${name}`);
  }
  ok(`package.json script: ${name}`);
}

console.log('\nPhase 7 meta verification passed.');
